export function hasRunnerAccess(request: Request, sharedSecret?: string): boolean {
  if (!sharedSecret) {
    return true;
  }

  return request.headers.get("x-runner-secret") === sharedSecret;
}
