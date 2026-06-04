CREATE TABLE "chat_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_address" text NOT NULL,
	"minute_window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"minute_message_count" integer DEFAULT 0 NOT NULL,
	"daily_token_window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"daily_estimated_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
TRUNCATE TABLE "messages", "conversations" RESTART IDENTITY CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "chat_user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "conversation_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "conversation_name_generated_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_users_ip_address_idx" ON "chat_users" USING btree ("ip_address");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_chat_user_id_chat_users_id_fk" FOREIGN KEY ("chat_user_id") REFERENCES "public"."chat_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_user_name_idx" ON "conversations" USING btree ("chat_user_id","conversation_name");
