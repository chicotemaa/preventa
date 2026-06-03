import serverlessChromium from "@sparticuz/chromium";
import { chromium as playwrightChromium, type Browser } from "playwright";
import { config } from "./config.js";

export async function launchBrowser(): Promise<Browser> {
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH?.trim();

  if (executablePath) {
    return playwrightChromium.launch({
      executablePath,
      headless: config.headless,
    });
  }

  if (isServerlessRuntime()) {
    return playwrightChromium.launch({
      args: serverlessChromium.args,
      executablePath: await serverlessChromium.executablePath(),
      headless: true,
    });
  }

  return playwrightChromium.launch({ headless: config.headless });
}

function isServerlessRuntime() {
  return process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}
