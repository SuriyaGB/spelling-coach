import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function findAnthropicDirs(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const results = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (!stats.isDirectory()) {
      continue;
    }

    if (entry === "@langchain") {
      const anthropicDir = join(fullPath, "anthropic");
      if (existsSync(join(anthropicDir, "package.json"))) {
        results.push(anthropicDir);
      }
      continue;
    }

    if (entry === ".bin") {
      continue;
    }

    results.push(...findAnthropicDirs(fullPath));
  }

  return results;
}

for (const anthropicDir of findAnthropicDirs(join(process.cwd(), "node_modules"))) {
  const packageJsonPath = join(anthropicDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const exportsField = packageJson.exports ?? {};

  if (!exportsField["./zod"]) {
    exportsField["./zod"] = {
      types: {
        import: "./zod.d.ts",
        require: "./zod.d.ts",
        default: "./zod.d.ts",
      },
      import: "./zod.js",
      require: "./zod.js",
    };
    packageJson.exports = exportsField;
    writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  }

  const zodJsPath = join(anthropicDir, "zod.js");
  const zodDtsPath = join(anthropicDir, "zod.d.ts");

  if (!existsSync(zodJsPath)) {
    writeFileSync(zodJsPath, "export {};\n");
  }

  if (!existsSync(zodDtsPath)) {
    writeFileSync(zodDtsPath, "export {};\n");
  }
}
