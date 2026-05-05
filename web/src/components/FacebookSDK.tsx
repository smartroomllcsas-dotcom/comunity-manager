'use client'

import Script from 'next/script'

export default function FacebookSDK() {
  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID
  if (!appId) return null

  return (
    <>
      <div id="fb-root" />
      <Script id="fb-init" strategy="afterInteractive">
        {`
          window.fbAsyncInit = function() {
            FB.init({
              appId      : '${appId}',
              cookie     : true,
              xfbml      : true,
              version    : 'v21.0'
            });
            FB.AppEvents.logPageView();
          };
        `}
      </Script>
      <Script
        id="facebook-jssdk"
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="afterInteractive"
        crossOrigin="anonymous"
      />
    </>
  )
}
