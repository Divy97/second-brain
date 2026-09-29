CREATE TYPE "capture_quality" AS ENUM ('full', 'partial');
ALTER TABLE "items" ADD COLUMN "capture_quality" "capture_quality";
CREATE TABLE "file_deletions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "file_key" text NOT NULL UNIQUE,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
