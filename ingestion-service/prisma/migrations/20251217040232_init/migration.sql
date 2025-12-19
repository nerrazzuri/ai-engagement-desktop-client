-- CreateTable
CREATE TABLE "InstallRegistry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "install_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EngagementEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dedup_key" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "content_text" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SuggestionSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "input_snapshot" TEXT NOT NULL,
    "suggestion_text" TEXT NOT NULL,
    "brain_meta" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SuggestionSession_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "EngagementEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeedbackSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "final_text" TEXT,
    "edit_distance" INTEGER,
    "time_to_action" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackSignal_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "SuggestionSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "InstallRegistry_install_id_key" ON "InstallRegistry"("install_id");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementEvent_dedup_key_key" ON "EngagementEvent"("dedup_key");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackSignal_session_id_key" ON "FeedbackSignal"("session_id");
