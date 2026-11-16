/**
 * The server formats a few dates for people (`toLocaleDateString()` in the
 * duplicate-detection messages), which depends on the machine's locale and
 * time zone. Pin both, so a snapshot taken on one laptop matches CI and every
 * other laptop. Only the test process is affected.
 */
process.env.TZ = "UTC";

const toLocaleDateString = Date.prototype.toLocaleDateString;
Date.prototype.toLocaleDateString = function (this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
  return toLocaleDateString.call(this, locales ?? "en-US", { timeZone: "UTC", ...options });
};
