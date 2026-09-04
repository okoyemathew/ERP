const fs = require("fs");
const path = require("path");

const fallbackRepo = 'maven { url = uri("https://repo1.maven.org/maven2") }';

if (process.env.EAS_BUILD_PLATFORM && process.env.EAS_BUILD_PLATFORM !== "android") {
  console.log("Skipping Android Maven fallback because this is not an Android EAS build.");
  process.exit(0);
}

const projectRoot = path.resolve(__dirname, "..");

const targets = [
  path.join(projectRoot, "android", "settings.gradle"),
  path.join(projectRoot, "android", "build.gradle"),
  path.join(
    projectRoot,
    "node_modules",
    "@react-native",
    "gradle-plugin",
    "settings.gradle.kts",
  ),
];

let patchedCount = 0;

for (const target of targets) {
  if (!fs.existsSync(target)) {
    continue;
  }

  const source = fs.readFileSync(target, "utf8");
  const updated = addFallbackRepository(source);

  if (updated !== source) {
    fs.writeFileSync(target, updated);
    patchedCount += 1;
    console.log(`Added Maven Central fallback repository to ${path.relative(projectRoot, target)}`);
  }
}

if (patchedCount === 0) {
  console.log("No Gradle repository files needed a Maven Central fallback.");
}

function addFallbackRepository(source) {
  if (source.includes("repo1.maven.org/maven2")) {
    return source;
  }

  return source.replace(
    /^(\s*)mavenCentral\(\)/gm,
    (_match, indent) => `${indent}${fallbackRepo}\n${indent}mavenCentral()`,
  );
}
