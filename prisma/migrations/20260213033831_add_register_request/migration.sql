-- CreateTable
CREATE TABLE "RegisterRequest" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "otpExpiresAt" TIMESTAMP(3) NOT NULL,
    "otpVerifiedAt" TIMESTAMP(3),
    "emailTokenHash" TEXT NOT NULL,
    "emailTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegisterRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegisterRequest_email_key" ON "RegisterRequest"("email");
