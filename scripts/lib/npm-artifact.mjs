import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DEPENDENCY_SECTIONS = Object.freeze([
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
]);
const LOCAL_PROTOCOLS = Object.freeze(["workspace:", "link:", "file:"]);

/**
 * Reject dependency declarations that cannot be resolved by a public registry consumer.
 * This validates the packed manifest, after npm has applied its publish transformations.
 */
export function assertPublicDependencySpecifiers(manifest) {
  for (const section of DEPENDENCY_SECTIONS) {
    const dependencies = manifest[section];
    if (dependencies === undefined) continue;
    if (dependencies === null || Array.isArray(dependencies) || typeof dependencies !== "object") {
      throw new Error(`packed manifest ${section} must be an object`);
    }

    for (const [name, specifier] of Object.entries(dependencies)) {
      if (typeof specifier !== "string") {
        throw new Error(`packed manifest ${section}.${name} must be a string`);
      }
      const protocol = LOCAL_PROTOCOLS.find((prefix) => specifier.startsWith(prefix));
      if (protocol !== undefined) {
        throw new Error(
          `packed manifest ${section}.${name} uses forbidden local protocol ${protocol}`,
        );
      }
    }
  }
}

export function assertExactPackedDependencies(manifest, expectedDependencies) {
  const actual = JSON.stringify(
    Object.fromEntries(Object.entries(manifest.dependencies ?? {}).sort()),
  );
  const expected = JSON.stringify(Object.fromEntries(Object.entries(expectedDependencies).sort()));
  if (actual !== expected) {
    throw new Error(`packed manifest dependencies must be exactly ${expected}; found ${actual}`);
  }
}

/** Run the same npm packing lifecycle and manifest transformation used before npm publication. */
export function packPublicPackage(packageDir, destination) {
  execFileSync(
    "npm",
    ["pack", "--pack-destination", destination, "--cache", join(destination, "npm-cache")],
    { cwd: packageDir, stdio: "inherit" },
  );

  const tarballs = readdirSync(destination).filter((name) => name.endsWith(".tgz"));
  if (tarballs.length !== 1) throw new Error(`expected one tarball, found ${tarballs.length}`);

  const tarballName = tarballs[0];
  const tarball = join(destination, tarballName);
  const files = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
    .trim()
    .split("\n")
    .sort();
  const manifest = JSON.parse(
    execFileSync("tar", ["-xOf", tarball, "package/package.json"], { encoding: "utf8" }),
  );

  assertPublicDependencySpecifiers(manifest);

  return Object.freeze({
    tarball,
    tarballName,
    files: Object.freeze(files),
    manifest,
    sha256: createHash("sha256").update(readFileSync(tarball)).digest("hex"),
  });
}
