// Format private key to replace /n 
export function formatPrivateKey(key: string) {
    return key.replace(/\\n/g, "\n")
  }