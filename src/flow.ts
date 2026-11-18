    .waitFor({ state: "attached", timeout: timeoutMs })
    .catch(() => {
      throw new Error(`Flow did not finish processing the upload "${name}" within ${Math.round(timeoutMs / 1000)}s.`);
    });
  await pause(page, 1000);
}

// Uploads under a unique filename so the asset can be picked unambiguously afterwards.
// "asset:<name>" refers to something already in the Flow project (image, video, character) and skips the upload.
async function uploadAsset(page: Page, job: Job, file: string, label: string): Promise<string> {
  if (file.startsWith(ASSET_PREFIX)) return file.slice(ASSET_PREFIX.length).trim();
  if (!existsSync(file)) throw new Error(`File not found: ${file}`);
  // Chrome's allowAndName download mode saves files under UUIDs without extensions. Detect the actual
  // media type from its signature before staging it: Flow's upload picker rejects otherwise valid images
  // when the temporary filename has no image extension.
  const detectedExtension = extensionOf(file);
  const extension = detectedExtension !== ".bin" ? detectedExtension : extname(file).toLowerCase();
  if (!extension) throw new Error(`Cannot determine the file type for "${file}". Give the file a supported extension (jpg, png, webp or mp4) and try again.`);
  const name = `fm-${job.id}-${label}${extension}`;
  const staged = join(mkdtempSync(join(tmpdir(), "flow-mcp-")), name);
  copyFileSync(file, staged);
  await scrollToTop(page);
  await page.getByRole("button", { name: "Add media menu" }).click();
  const chooser = page.waitForEvent("filechooser", { timeout: 10_000 });
  await page.getByRole("menuitem", { name: "Upload", exact: true }).click();
  await (await chooser).setFiles(staged);
  await waitForUpload(page, name, 90_000);
  return name;
}

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Options read "<name>", "<name> Image|Video|Avatar" or "<voice> <description>", so match on the leading name.