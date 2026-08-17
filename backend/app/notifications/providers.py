"""
Notification provider abstractions (spec section 27).

InAppNotificationProvider is fully implemented (writes to the Notification
table, already wired into pickup/complaint services). Email/SMS/Push are
interfaces only — the MVP does not fabricate having working credentials for
any external channel it can't reliably configure.
"""
from abc import ABC, abstractmethod

from sqlalchemy.orm import Session

from app.models.enums import NotificationType
from app.models.notifications_audit import Notification


class NotificationProvider(ABC):
    @abstractmethod
    def send(self, user_id: str, notification_type: NotificationType, title: str, body: str) -> None:
        ...


class InAppNotificationProvider(NotificationProvider):
    """The only channel actually implemented in the MVP."""

    def __init__(self, db: Session):
        self.db = db

    def send(self, user_id: str, notification_type: NotificationType, title: str, body: str) -> None:
        self.db.add(Notification(user_id=user_id, type=notification_type, title=title, body=body))
        self.db.commit()


class EmailProvider(ABC):
    """
    Interface only. No SMTP/transactional-email credentials are configured
    in the MVP, so this is not wired up — implement against your provider
    (SES, Postmark, SendGrid, ...) via this interface later.
    """

    @abstractmethod
    def send_email(self, to_address: str, subject: str, body_html: str) -> None:
        raise NotImplementedError("Email provider not configured in the MVP. See docs/notifications.md.")


class SMSProvider(ABC):
    """Interface only — no SMS gateway credentials configured (spec section 70, Phase 2)."""

    @abstractmethod
    def send_sms(self, to_phone_number: str, message: str) -> None:
        raise NotImplementedError("SMS provider not configured in the MVP. See docs/notifications.md.")


class PushNotificationProvider(ABC):
    """Interface only — no push notification service configured (Phase 2)."""

    @abstractmethod
    def send_push(self, device_token: str, title: str, body: str) -> None:
        raise NotImplementedError("Push provider not configured in the MVP. See docs/notifications.md.")
