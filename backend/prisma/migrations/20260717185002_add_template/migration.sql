-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "layoutKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "fields" TEXT NOT NULL DEFAULT '{}',
    "html" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "brandId" TEXT NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Template_brandId_name_key" ON "Template"("brandId", "name");

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
