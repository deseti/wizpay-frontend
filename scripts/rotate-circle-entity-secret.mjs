import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";

const args = new Set(process.argv.slice(2));
const envFileArgIndex = process.argv.indexOf("--env-file");
const envFileArg =
  envFileArgIndex >= 0 ? process.argv[envFileArgIndex + 1] || null : null;

const shouldApply = args.has("--apply");
const envFilePath = path.resolve(process.cwd(), envFileArg || ".env.local");

try {
  const envFileContent = existsSync(envFilePath)
    ? readFileSync(envFilePath, "utf8")
    : "";
  const envValues = parseEnvFile(envFileContent);
  const apiKey = envValues.CIRCLE_API_KEY || process.env.CIRCLE_API_KEY?.trim() || "";
  const currentEntitySecret =
    envValues.CIRCLE_ENTITY_SECRET || process.env.CIRCLE_ENTITY_SECRET?.trim() || "";
  const baseUrl =
    envValues.CIRCLE_BASE_URL || process.env.CIRCLE_BASE_URL?.trim() || "https://api.circle.com";

  const currentSummary = summarizeSecret(currentEntitySecret);

  if (!apiKey) {
    throw new Error(
      `CIRCLE_API_KEY is missing from ${envFilePath}. Add it before rotating the Circle entity secret.`
    );
  }

  if (!shouldApply) {
    console.log(
      JSON.stringify(
        {
          action: "doctor",
          envFilePath,
          baseUrl,
          apiKey: {
            prefix: extractApiKeyPrefix(apiKey),
            fingerprint: fingerprint(apiKey),
            length: apiKey.length,
          },
          entitySecret: currentSummary,
          diagnosis: diagnoseCurrentSecret(currentEntitySecret),
          nextCommand: "npm run circle:entity-secret:rotate",
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const nextEntitySecret = randomBytes(32).toString("hex");
  const recoveryDirectory = path.join(
    path.dirname(envFilePath),
    "output",
    "circle-entity-secret"
  );
  mkdirSync(recoveryDirectory, { recursive: true });

  const response = await registerEntitySecretCiphertext({
    apiKey,
    entitySecret: nextEntitySecret,
    baseUrl,
    recoveryFileDownloadPath: recoveryDirectory,
  });

  const backupPath = existsSync(envFilePath)
    ? `${envFilePath}.backup.${timestampSuffix()}`
    : null;

  if (backupPath) {
    copyFileSync(envFilePath, backupPath);
  }

  const updatedEnvContent = upsertEnvValue(
    envFileContent,
    "CIRCLE_ENTITY_SECRET",
    nextEntitySecret
  );
  writeFileSync(envFilePath, updatedEnvContent, "utf8");

  console.log(
    JSON.stringify(
      {
        action: "rotate",
        envFilePath,
        backupPath,
        baseUrl,
        apiKey: {
          prefix: extractApiKeyPrefix(apiKey),
          fingerprint: fingerprint(apiKey),
        },
        previousEntitySecret: currentSummary,
        nextEntitySecret: {
          fingerprint: fingerprint(nextEntitySecret),
          length: nextEntitySecret.length,
          isLowerHex64: isLowerHex64(nextEntitySecret),
        },
        recoveryDirectory,
        recoveryFileReturned: Boolean(response.data?.recoveryFile),
        nextSteps: [
          "Restart the frontend server so Next.js reloads the updated env file.",
          "Run the bridge-wallet bootstrap again after restart.",
          "Fund the source bridge wallet with gas and testnet USDC before retrying the bridge.",
        ],
      },
      null,
      2
    )
  );
} catch (error) {
  const normalizedError = toErrorPayload(error);
  const remediation = getRemediationAdvice({
    shouldApply,
    normalizedError,
    envFilePath,
  });

  console.error(
    JSON.stringify(
      {
        action: shouldApply ? "rotate" : "doctor",
        envFilePath,
        error: normalizedError,
        ...(remediation ? { remediation } : {}),
      },
      null,
      2
    )
  );
  process.exit(1);
}

function parseEnvFile(content) {
  const result = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function upsertEnvValue(content, key, value) {
  const nextLine = `${key}=${value}`;
  const linePattern = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");

  if (linePattern.test(content)) {
    return content.replace(linePattern, nextLine);
  }

  const separator = content && !content.endsWith("\n") ? "\n" : "";
  return `${content}${separator}${nextLine}\n`;
}

function diagnoseCurrentSecret(secret) {
  if (!secret) {
    return "CIRCLE_ENTITY_SECRET is missing from the active env file.";
  }

  if (isLowerHex64(secret)) {
    return "The current CIRCLE_ENTITY_SECRET already has raw 64-character lowercase hex format. If Circle write calls still fail, the secret likely belongs to a different entity or needs to be rotated and re-registered for this API key.";
  }

  if (looksBase64Like(secret)) {
    return "The current CIRCLE_ENTITY_SECRET looks like a recovery file payload or ciphertext, not the raw secret required by the SDK.";
  }

  return "The current CIRCLE_ENTITY_SECRET has an unexpected format and should be replaced with a freshly generated raw secret that is registered against the active API key.";
}

function summarizeSecret(secret) {
  return {
    fingerprint: fingerprint(secret),
    length: secret.length,
    isLowerHex64: isLowerHex64(secret),
    looksBase64Like: looksBase64Like(secret),
  };
}

function extractApiKeyPrefix(apiKey) {
  if (!apiKey) {
    return null;
  }

  const [prefix] = apiKey.split(":", 1);
  return prefix || null;
}

function isLowerHex64(value) {
  return /^[0-9a-f]{64}$/.test(value);
}

function looksBase64Like(value) {
  return /^([0-9A-Za-z+/]{4})*(([0-9A-Za-z+/]{2}==)|([0-9A-Za-z+/]{3}=))?$/.test(
    value
  );
}

function fingerprint(value) {
  if (!value) {
    return null;
  }

  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function timestampSuffix() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toErrorPayload(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      ...(typeof error.stack === "string" ? { stack: error.stack } : {}),
      ...getErrorFields(error),
    };
  }

  return {
    message: String(error),
  };
}

function getErrorFields(error) {
  if (!error || typeof error !== "object") {
    return {};
  }

  const maybeRecord = error;
  return {
    ...(typeof maybeRecord.status === "number" ? { status: maybeRecord.status } : {}),
    ...(typeof maybeRecord.code === "number" || typeof maybeRecord.code === "string"
      ? { code: maybeRecord.code }
      : {}),
    ...(typeof maybeRecord.method === "string" ? { method: maybeRecord.method } : {}),
    ...(typeof maybeRecord.url === "string" ? { url: maybeRecord.url } : {}),
  };
}

function getRemediationAdvice({ shouldApply, normalizedError, envFilePath }) {
  if (!shouldApply || !normalizedError) {
    return null;
  }

  if (normalizedError.code === 156015) {
    const envFileContent = existsSync(envFilePath)
      ? readFileSync(envFilePath, "utf8")
      : "";
    const envValues = parseEnvFile(envFileContent);
    const currentEntitySecret = envValues.CIRCLE_ENTITY_SECRET || "";

    return {
      summary:
        "Circle rejected first-time registration because this entity already has an entity secret configured. Registering again will not fix the bridge.",
      likelyInterpretation: isLowerHex64(currentEntitySecret)
        ? "The env already contains a raw-looking secret, but it is not the right current secret for this Circle entity."
        : looksBase64Like(currentEntitySecret)
          ? "The env value looks more like recovery-file content or another payload than the raw 64-character entity secret."
          : "The env value is not in the raw 64-character entity-secret format.",
      nextSteps: [
        "If you still have the current raw 64-character entity secret for this Circle entity, use the official rotate flow with the current secret and a newly generated secret.",
        "If you do not have the current raw entity secret, locate the original recovery_file_<timestamp>.dat and use Circle's reset flow instead.",
        "If both the current entity secret and the recovery file are gone, Circle docs state you cannot recover developer-controlled wallet write access for that entity from the SDK alone.",
      ],
    };
  }

  return null;
}