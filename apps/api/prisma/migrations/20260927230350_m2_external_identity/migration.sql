-- AlterTable
ALTER TABLE "OrganizationMembership" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'INTERNAL';

-- CreateTable
CREATE TABLE "ChatProjectParticipant" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "linkedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ChatProjectParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatProjectParticipant_organizationId_projectId_userId_key" ON "ChatProjectParticipant"("organizationId", "projectId", "userId");

-- AddForeignKey
ALTER TABLE "ChatProjectParticipant" ADD CONSTRAINT "ChatProjectParticipant_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatProjectParticipant" ADD CONSTRAINT "ChatProjectParticipant_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "OrganizationMembership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_kind_check" CHECK ("kind" IN ('INTERNAL','EXTERNAL'));

-- Catalog only: no assignment to any existing user/role.
INSERT INTO "Permission" ("id","code","name","description","module")
SELECT gen_random_uuid(), code, name, 'Năng lực cấp quyền chat theo Project; không tự mở nội dung', 'project-chat'
FROM (VALUES
 ('chat.create','Tạo cuộc trao đổi'), ('chat.access.manage','Quản trị truy cập chat'),
 ('chat.lock','Khóa cuộc trao đổi'), ('chat.history','Mở lịch sử'),
 ('chat.publish','Phát hành hồ sơ khách'), ('chat.read','Đọc cuộc trao đổi'),
 ('chat.send','Gửi tin'), ('chat.upload','Đính kèm file'), ('chat.download','Tải file')
) AS capability(code,name)
ON CONFLICT ("code") DO NOTHING;
