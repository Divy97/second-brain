CREATE TABLE "facts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"search_text" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"embedding_model" text NOT NULL,
	"embedding_dimensions" integer NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', "facts"."search_text")) STORED,
	"source_item_id" uuid NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_source_item_id_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "facts_user_valid_idx" ON "facts" USING btree ("user_id","valid_to");
--> statement-breakpoint
CREATE INDEX "facts_source_item_idx" ON "facts" USING btree ("source_item_id");
--> statement-breakpoint
CREATE INDEX "facts_embedding_idx" ON "facts" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
CREATE INDEX "facts_tsv_idx" ON "facts" USING gin ("tsv");
