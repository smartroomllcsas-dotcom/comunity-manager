interface FBLoginStatusResponse {
  status: 'connected' | 'not_authorized' | 'unknown'
  authResponse?: {
    accessToken?: string
    userID?: string
    expiresIn?: number
    signedRequest?: string
    graphDomain?: string
    data_access_expiration_time?: number
    code?: string
  }
}

interface FBSDK {
  init: (params: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }) => void
  login: (
    cb: (response: FBLoginStatusResponse) => void,
    options?: { scope?: string; return_scopes?: boolean } & Record<string, unknown>
  ) => void
  logout: (cb?: (response: unknown) => void) => void
  getLoginStatus: (cb: (response: FBLoginStatusResponse) => void) => void
  AppEvents: {
    logPageView: () => void
    logEvent: (name: string, value?: number, params?: Record<string, string | number>) => void
  }
  api: (path: string, ...args: unknown[]) => void
}

declare global {
  interface Window {
    FB: FBSDK
    fbAsyncInit: () => void
  }
}

export {}
