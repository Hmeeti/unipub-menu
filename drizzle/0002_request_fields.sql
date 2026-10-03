ALTER TABLE "requests" ADD COLUMN "locale" text DEFAULT 'ru' NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "accepted_by_tg" bigint;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "session_hash" text;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_idempotency_key_unique" UNIQUE("idempotency_key");