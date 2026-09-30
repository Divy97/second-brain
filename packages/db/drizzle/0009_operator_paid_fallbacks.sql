DELETE FROM "user_keys" WHERE "provider" IN ('transcript', 'reader');--> statement-breakpoint
ALTER TABLE "user_keys" ALTER COLUMN "provider" TYPE text;--> statement-breakpoint
DROP TYPE "key_provider";--> statement-breakpoint
CREATE TYPE "key_provider" AS ENUM ('openrouter');--> statement-breakpoint
ALTER TABLE "user_keys" ALTER COLUMN "provider" TYPE "key_provider" USING "provider"::"key_provider";--> statement-breakpoint
CREATE TYPE "paid_service" AS ENUM ('transcript', 'reader');--> statement-breakpoint
CREATE TYPE "partial_reason" AS ENUM ('allowance_used');--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "partial_reason" "partial_reason";--> statement-breakpoint
CREATE TABLE "paid_lookup_usage" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"service" "paid_service" NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "paid_lookup_usage_user_id_day_service_pk" PRIMARY KEY("user_id","day","service")
);--> statement-breakpoint
ALTER TABLE "paid_lookup_usage" ADD CONSTRAINT "paid_lookup_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
