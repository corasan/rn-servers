#!/usr/bin/env node

import { run } from "../src/cli.js";
import { printError } from "../src/ui.js";

run(process.argv.slice(2)).catch((error) => {
  printError(error);
  process.exitCode = 1;
});
