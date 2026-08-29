// Tabler outline icons (https://tabler.io/icons), vendored as raw SVG under
// ./svg rather than pulled in as an npm package — keeps this dependency-free
// and matches the project's self-hosted-infrastructure approach. Only the
// icons actually used in the app are here; add more by dropping the .svg
// (outline set) into ./svg and referencing its kebab-case filename as `name`.
const rawIcons = import.meta.glob("./svg/*.svg", { query: "?raw", import: "default", eager: true });

const ICONS = Object.fromEntries(
	Object.entries(rawIcons).map(([path, svg]) => {
		const name = path.replace("./svg/", "").replace(".svg", "");
		// Tabler ships width/height="24" — swapping to 1em lets `size` (via
		// font-size) control it, and stroke="currentColor" already means
		// `color` controls the stroke, so no per-icon CSS is needed.
		const scalable = svg.replace('width="24"', 'width="1em"').replace('height="24"', 'height="1em"');
		return [name, scalable];
	})
);

/**
 * <Icon name="search" size={16} color={C.slate} />
 * `name` is the icon's kebab-case filename under ./svg (e.g. "chef-hat" for
 * IconChefHat). Unknown names render nothing rather than throwing, so a
 * typo'd icon name doesn't crash the page.
 */
export default function Icon({ name, size = 18, color = "currentColor", style, ...rest }) {
	const svg = ICONS[name];
	if (!svg) return null;
	return (
		<span
			role="img"
			aria-label={rest["aria-label"] || name}
			style={{ display: "inline-flex", fontSize: size, color, lineHeight: 0, flexShrink: 0, ...style }}
			dangerouslySetInnerHTML={{ __html: svg }}
			{...rest}
		/>
	);
}
