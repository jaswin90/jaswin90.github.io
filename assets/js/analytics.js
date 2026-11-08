// Visitor analytics (Google Analytics 4, through the site's Firebase project).
// Loaded on the site's pages and on every book page. It sends page views only, with IP
// anonymisation and no advertising features, and does nothing when the browser asks not to be
// tracked or when the build has no measurement ID (firebaseConfig.measurementId).
import { firebaseConfig } from '/assets/js/firebase-config.js';

const id = firebaseConfig && firebaseConfig.measurementId;
const dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
if (id && !dnt && !window.gtag) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', id, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
  const s = document.createElement('script');
  s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(s);
}
