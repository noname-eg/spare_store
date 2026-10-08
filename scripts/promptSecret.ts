import { stdin as input, stdout as output } from "node:process";

/**
 * Reads a secret one character at a time without echoing it, so a password typed into
 * a shared terminal or captured in scrollback cannot leak. Shared by the admin scripts
 * because a leaked console password is a leaked credential.
 */
export function readSecret(prompt: string): Promise<string> {
  return new Promise<string>((resolve) => {
    output.write(prompt);
    let value = "";
    const onData = (chunk: Buffer | string) => {
      for (const character of String(chunk)) {
        if (character === "\u0003") process.exit(130);
        if (character === "\r" || character === "\n") {
          input.setRawMode?.(false);
          input.pause();
          input.off("data", onData);
          output.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f") {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    input.resume();
    input.setRawMode?.(true);
    input.on("data", onData);
  });
}
