CREATE TYPE "public"."capture_mode" AS ENUM('index', 'store');--> statement-breakpoint
ALTER TYPE "public"."item_status" ADD VALUE 'stored';--> statement-breakpoint
CREATE TABLE "capture_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"passive_enabled" boolean DEFAULT false NOT NULL,
	"passive_mode" "capture_mode" DEFAULT 'store' NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"blocklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "client_text" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "capture_settings" ADD CONSTRAINT "capture_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;