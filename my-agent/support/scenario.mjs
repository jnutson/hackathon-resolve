// Reviewed demo scenario. Supporting another model requires a new procedure and sources,
// not just changing a product name in an environment variable.
export const MODEL = "Garmin Forerunner 165";
export const ROOT =
  "/manuals/webhelp/GUID-607F08F6-33FC-40BF-9727-84E54043D82D/EN-US/";
export const TOUCH_URL = `https://www8.garmin.com${ROOT}GUID-C8435F75-31AA-497C-88E8-2944AA182AEA.html`;
export const BUTTONS_URL = `https://www8.garmin.com${ROOT}GUID-F04730B5-B214-4E08-AA64-61D1C197F35F.html`;
export const PROCEDURE_ID = "garmin-165-enable-touch-v1";
export const GREETING = `Hi, I’m Resolve, your AI troubleshooting assistant. I have your device as a ${MODEL}. What’s happening with it?`;
