-- Remove duplicate votes (same user, same idea), keeping the oldest row, so the unique constraint can be added.
DELETE FROM "votes" v
 USING "votes" older
 WHERE older."feedback_id" = v."feedback_id"
   AND older."user_id" = v."user_id"
   AND (older."created_at", older."id") < (v."created_at", v."id");
--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_feedback_id_user_id_unique" UNIQUE("feedback_id","user_id");
