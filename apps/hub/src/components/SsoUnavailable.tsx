import { Alert } from "./ui";

/**
 * Shown when a module can't be opened with OmniForce sign-in yet. We never
 * pretend the hand-off worked: the user is pointed at the module's own login.
 */
export function SsoUnavailable({ name, appUrl, message }: { name: string; appUrl: string | null; message?: string }) {
  return (
    <Alert tone="info">
      <strong>Single sign-on to {name} isn't live yet.</strong>{" "}
      {message ?? `Signing in to ${name} with OmniForce isn't available yet.`}{" "}
      {appUrl && <>Open <a href={appUrl} target="_blank" rel="noopener noreferrer">{new URL(appUrl).host}</a> and sign in with your existing {name} login.</>}
    </Alert>
  );
}
