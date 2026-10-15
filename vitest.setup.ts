import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Registered explicitly because Vitest globals are off in this project.
afterEach(cleanup);
