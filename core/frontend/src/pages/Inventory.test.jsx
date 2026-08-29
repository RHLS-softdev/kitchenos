import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Inventory from "./Inventory";

// Inventory.jsx (like every CRUD page in this app) takes its data and
// mutation callbacks as props rather than fetching itself — App.jsx owns
// the api client. That means these tests need no network/API mocking at
// all: just pass plain data in and spy on the callbacks.
const flour = { id: 1, name: "Flour", category: "Dry goods", unit: "kg", qty: 2, parLevel: 10, cost: 1.2, supplier: "Acme Mills", expires: null, locationId: 100 };
const cream = { id: 2, name: "Heavy cream", category: "Dairy", unit: "L", qty: 20, parLevel: 5, cost: 3.5, supplier: "", expires: null, locationId: 100 };
const mainKitchen = { id: 100, name: "Main Kitchen", isDefault: true };

const baseProps = {
	inventory: [flour, cream],
	batches: [],
	suppliers: [],
	locations: [mainKitchen],
	userRole: "owner",
	onAdd: vi.fn().mockResolvedValue({ ok: true }),
	onEdit: vi.fn().mockResolvedValue({ ok: true }),
	onDelete: vi.fn(),
	onLogWaste: vi.fn().mockResolvedValue({ ok: true }),
	onAddBatch: vi.fn().mockResolvedValue({ ok: true }),
	onEditBatch: vi.fn().mockResolvedValue({ ok: true }),
	onDeleteBatch: vi.fn(),
	onAddLocation: vi.fn().mockResolvedValue({ ok: true }),
	onEditLocation: vi.fn().mockResolvedValue({ ok: true }),
	onDeleteLocation: vi.fn().mockResolvedValue({ ok: true }),
};

describe("Inventory list", () => {
	it("renders every item and flags the one below par", () => {
		render(<Inventory {...baseProps} />);
		expect(screen.getByText("Flour")).toBeInTheDocument();
		expect(screen.getByText("Heavy cream")).toBeInTheDocument();
		expect(screen.getByText("critical")).toBeInTheDocument(); // flour: 2 of 10 par
		expect(screen.getByText("ok")).toBeInTheDocument(); // cream: well above par
	});

	it("search narrows the list to matching name/category", async () => {
		render(<Inventory {...baseProps} />);
		await userEvent.type(screen.getByPlaceholderText("Search inventory..."), "cream");
		expect(screen.queryByText("Flour")).not.toBeInTheDocument();
		expect(screen.getByText("Heavy cream")).toBeInTheDocument();
	});

	it("shows the empty state when a search matches nothing", async () => {
		render(<Inventory {...baseProps} />);
		await userEvent.type(screen.getByPlaceholderText("Search inventory..."), "zzz");
		expect(screen.getByText("No items match your search.")).toBeInTheDocument();
	});
});

describe("Inventory add-item flow", () => {
	it("opens the form, submits, and calls onAdd with typed values", async () => {
		const onAdd = vi.fn().mockResolvedValue({ ok: true });
		render(<Inventory {...baseProps} onAdd={onAdd} />);
		await userEvent.click(screen.getByText("+ Add item"));
		// Field/VoiceField labels aren't linked to their input via htmlFor, so
		// getByLabelText doesn't work here — instead scope down from the
		// modal's title to its box, then take the first input in that box
		// (the name field is the first thing InvForm renders).
		const modalBox = screen.getByText("Add inventory item").parentElement.parentElement;
		const nameInput = modalBox.querySelector("input");
		await userEvent.type(nameInput, "Butter");
		await userEvent.click(screen.getByText("Add item"));
		expect(onAdd).toHaveBeenCalledTimes(1);
		expect(onAdd.mock.calls[0][0].name).toBe("Butter");
	});

	it("blocks submit and shows a validation error when name is blank", async () => {
		const onAdd = vi.fn();
		render(<Inventory {...baseProps} onAdd={onAdd} />);
		await userEvent.click(screen.getByText("+ Add item"));
		await userEvent.click(screen.getByText("Add item"));
		expect(onAdd).not.toHaveBeenCalled();
		expect(screen.getByText("Item name is required")).toBeInTheDocument();
	});
});

describe("Inventory batch (FIFO lot) tracking", () => {
	it("shows the no-batches empty state, then adds a batch via the panel", async () => {
		const onAddBatch = vi.fn().mockResolvedValue({ ok: true });
		render(<Inventory {...baseProps} onAddBatch={onAddBatch} />);
		// Every row has a "Batches" toggle with this same title — [0] is flour's.
		await userEvent.click(screen.getAllByTitle("FIFO batch / lot tracking")[0]);
		expect(screen.getByText(/stock is tracked as one undifferentiated quantity/)).toBeInTheDocument();

		await userEvent.click(screen.getByText("+ Add batch"));
		fireEvent.change(screen.getByPlaceholderText("Optional — e.g. supplier's lot code"), { target: { value: "LOT-42" } });
		await userEvent.click(screen.getByText("Add batch"));

		expect(onAddBatch).toHaveBeenCalledTimes(1);
		expect(onAddBatch.mock.calls[0][0]).toMatchObject({ inventoryItemId: 1, lotNumber: "LOT-42" });
	});

	it("lists existing batches oldest-received-first and labels the FIFO-next lot", () => {
		const batches = [
			{ id: 10, inventoryItemId: 1, lotNumber: "NEWER", qty: 3, unitCost: 1.1, receivedDate: "2026-08-01", expires: null },
			{ id: 11, inventoryItemId: 1, lotNumber: "OLDER", qty: 5, unitCost: 1.0, receivedDate: "2026-07-01", expires: null },
		];
		render(<Inventory {...baseProps} batches={batches} />);
		fireEvent.click(screen.getAllByTitle("FIFO batch / lot tracking")[0]);
		const rows = screen.getAllByText(/OLDER|NEWER/);
		expect(rows[0]).toHaveTextContent("OLDER"); // sorted by receivedDate, not insertion order
		expect(screen.getByText("FIFO next")).toBeInTheDocument();
	});
});

describe("Multi-location inventory", () => {
	it("shows each item's location, and filters the list by location", async () => {
		const fridge = { id: 200, name: "Walk-in Fridge", isDefault: false };
		render(<Inventory {...baseProps} locations={[mainKitchen, fridge]}
			inventory={[flour, { ...cream, locationId: fridge.id }]} />);
		expect(screen.getAllByText("Main Kitchen").length).toBeGreaterThan(0);

		// The location filter is the only <select> holding "All locations".
		const filterSelect = screen.getByText("All locations").closest("select");
		fireEvent.change(filterSelect, { target: { value: String(fridge.id) } });
		expect(screen.queryByText("Flour")).not.toBeInTheDocument();
		expect(screen.getByText("Heavy cream")).toBeInTheDocument();
	});

	it("shows 'Unassigned' for an item with no location", () => {
		render(<Inventory {...baseProps} inventory={[{ ...flour, locationId: null }]} />);
		expect(screen.getByText("Unassigned")).toBeInTheDocument();
	});

	it("new items default to the org's default location", async () => {
		const onAdd = vi.fn().mockResolvedValue({ ok: true });
		render(<Inventory {...baseProps} onAdd={onAdd} />);
		await userEvent.click(screen.getByText("+ Add item"));
		const modalBox = screen.getByText("Add inventory item").parentElement.parentElement;
		await userEvent.type(modalBox.querySelector("input"), "Butter");
		await userEvent.click(screen.getByText("Add item"));
		expect(onAdd.mock.calls[0][0].locationId).toBe(mainKitchen.id);
	});

	it("opens the Manage locations panel and adds a new location", async () => {
		const onAddLocation = vi.fn().mockResolvedValue({ ok: true });
		render(<Inventory {...baseProps} onAddLocation={onAddLocation} />);
		await userEvent.click(screen.getByText("Manage locations"));
		expect(screen.getByText("Manage locations", { selector: "div" })).toBeInTheDocument();

		await userEvent.type(screen.getByPlaceholderText("New location name (e.g. Walk-in Fridge)"), "Downtown Branch");
		await userEvent.click(screen.getByText("+ Add"));
		expect(onAddLocation).toHaveBeenCalledWith({ name: "Downtown Branch" });
	});

	it("surfaces the server's error when deleting a location that still has items", async () => {
		const onDeleteLocation = vi.fn().mockResolvedValue({ ok: false, error: "Move or reassign this location's inventory items before deleting it." });
		render(<Inventory {...baseProps} onDeleteLocation={onDeleteLocation} />);
		await userEvent.click(screen.getByText("Manage locations"));
		await userEvent.click(screen.getByTitle("Delete"));
		expect(await screen.findByText(/Move or reassign this location's inventory items/)).toBeInTheDocument();
	});
});
