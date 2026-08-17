# Notifications

## Implemented

In-app notifications (`app/notifications/providers.py::InAppNotificationProvider`, and directly via
the `Notification` model in service code) are fully implemented and wired into the pickup and
complaint lifecycles:

- Pickup assigned → notifies the citizen.
- Collection completed → notifies the citizen (with quantity/category).
- Reward points earned → notifies the citizen.
- Complaint status changed → notifies the reporter.

Endpoints: `GET /api/v1/notifications` (paginated, filterable by unread), `PATCH
/api/v1/notifications/{id}/read`, `PUT /api/v1/notifications/preferences`.

Verified over real HTTP: a citizen's notification list correctly showed both a `PICKUP_ASSIGNED`
and a `COLLECTION_COMPLETED` notification after the full pickup flow ran.

## Not implemented (interfaces only, per spec section 27)

`EmailProvider`, `SMSProvider`, `PushNotificationProvider` are abstract interfaces in
`app/notifications/providers.py`. None are wired to a real vendor (SES/SendGrid, Africa's Talking/
Twilio, FCM/APNs) because no credentials are configured in this environment, and the spec explicitly
says not to fabricate channels that can't be reliably configured. `NotificationPreference` rows
support `email_enabled`/`sms_enabled`/`push_enabled` flags already, so wiring a real provider later
only means implementing one of these interfaces and calling it from the same places the in-app
provider is already called — no schema or call-site changes needed.
