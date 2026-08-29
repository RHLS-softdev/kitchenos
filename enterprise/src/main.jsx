import React from "react";
import { createRoot } from "react-dom/client";
import { EnterpriseProviders } from "./providers";
import App from "./App";

createRoot(document.getElementById("root")).render(
	<React.StrictMode>
		<EnterpriseProviders>
			<App />
		</EnterpriseProviders>
	</React.StrictMode>
);
