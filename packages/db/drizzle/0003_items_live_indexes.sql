DROP INDEX "items_user_content_hash_idx";--> statement-breakpoint
DROP INDEX "items_user_captured_at_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "items_user_content_hash_idx" ON "items" USING btree ("user_id","content_hash") WHERE "items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "items_user_captured_at_idx" ON "items" USING btree ("user_id","captured_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "items"."deleted_at" is null;