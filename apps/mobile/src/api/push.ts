/**
 * Push notification registration (§11).
 *
 * The client's entire responsibility is: obtain a device token, hand it to the
 * backend, and display what arrives. It makes no decision about *whether* to
 * notify — that policy lives in apps/api (decideNotification) so it can be
 * changed without an App Store release.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT. expo-notifications is not installable and
 * no device or APNs/FCM endpoint is reachable, so no token has ever been
 * obtained and no notification has ever been delivered. Nothing here should be
 * treated as working until it has been run on a physical device.
 */

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { getClient } from "./session.ts";
import { object, bool, str } from "@nexus/contracts";

const registrationAck = object({ registered: bool(), deviceId: str({ max: 128 }) });

export type PushRegistrationResult =
  | { status: "REGISTERED"; token: string }
  | { status: "DENIED"; reason: string }
  | { status: "UNAVAILABLE"; reason: string };

/**
 * Request permission and register the device.
 *
 * Returns a discriminated result rather than throwing: a user declining
 * notifications is a normal outcome, not an error, and the app must continue
 * working fully without them.
 */
export async function registerForPush(): Promise<PushRegistrationResult> {
  // Simulators cannot receive push. Reporting that plainly beats a silent
  // no-op that looks like a backend bug during development.
  if (!Device.isDevice) {
    return { status: "UNAVAILABLE", reason: "Push notifications require a physical device." };
  }

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;

  if (!granted && existing.canAskAgain) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = requested.granted;
  }

  if (!granted) {
    return { status: "DENIED", reason: "Notification permission was not granted." };
  }

  if (Platform.OS === "android") {
    // Android requires an explicit channel before anything can be delivered.
    await Notifications.setNotificationChannelAsync("critical", {
      name: "Critical alerts",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;

  // The backend stores the token against the session's user. The app never
  // stores a push credential of its own.
  const result = await getClient().request("/v1/notifications/devices", registrationAck, {
    method: "POST",
    body: { token, platform: Platform.OS },
  });

  if (!result.ok) {
    return { status: "UNAVAILABLE", reason: result.error.message };
  }

  return { status: "REGISTERED", token };
}

export async function unregisterPush(token: string): Promise<void> {
  await getClient().request("/v1/notifications/devices/remove", registrationAck, {
    method: "POST",
    body: { token },
  });
}

/** Foreground presentation: critical alerts interrupt, everything else does not. */
export function configureForegroundBehaviour(): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const severity = (notification.request.content.data as { severity?: string } | undefined)?.severity;
      const critical = severity === "CRITICAL";
      return {
        shouldShowAlert: critical,
        shouldPlaySound: critical,
        shouldSetBadge: true,
      };
    },
  });
}
