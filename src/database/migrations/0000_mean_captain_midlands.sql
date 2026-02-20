CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text,
	"age" integer,
	"gender" text,
	"skin_type" text,
	"allergies" text[] DEFAULT '{}',
	"conditions" text[] DEFAULT '{}',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_summaries" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"recent_medications" jsonb DEFAULT '[]',
	"recent_food" jsonb DEFAULT '[]',
	"recent_makeup" jsonb DEFAULT '[]',
	"recent_prescriptions" jsonb DEFAULT '[]',
	"flagged_ingredients" text[] DEFAULT '{}',
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"oracle_bucket" text NOT NULL,
	"oracle_key" text NOT NULL,
	"url" text NOT NULL,
	"scan_type" text NOT NULL,
	"mime_type" text DEFAULT 'image/jpeg',
	"size_bytes" integer,
	"uploaded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_type" text,
	"product_name" text,
	"brand" text,
	"manufacturer" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scan_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"image_id" uuid,
	"product_id" uuid,
	"scan_type" text NOT NULL,
	"raw_ocr_text" text,
	"parsed_result" jsonb NOT NULL,
	"embedding" vector(384),
	"confidence" text,
	"scanned_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scanned_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"expiry_date" text,
	"batch_info" text,
	"usage_directions" text,
	"warnings" text[] DEFAULT '{}',
	"scanned_at" timestamp DEFAULT now(),
	CONSTRAINT "scanned_labels_scan_id_unique" UNIQUE("scan_id")
);
--> statement-breakpoint
CREATE TABLE "scanned_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"purpose" text,
	"is_allergen" boolean DEFAULT false,
	"scanned_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scanned_prescriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"hospital_name" text,
	"doctor_name" text,
	"doctor_specialization" text,
	"doctor_contact" text,
	"patient_name" text,
	"diagnosis" text,
	"prescription_date" text,
	"refills" text,
	"scanned_at" timestamp DEFAULT now(),
	CONSTRAINT "scanned_prescriptions_scan_id_unique" UNIQUE("scan_id")
);
--> statement-breakpoint
CREATE TABLE "medications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"prescription_id" uuid,
	"product_id" uuid,
	"name" text NOT NULL,
	"dosage" text,
	"frequency" text,
	"duration" text,
	"instructions" text,
	"source" text NOT NULL,
	"added_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "allergen_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"allergen" text NOT NULL,
	"found_in" text NOT NULL,
	"flagged_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scan_id" uuid,
	"recommendation" text NOT NULL,
	"warnings" text[] DEFAULT '{}',
	"safe_to_use" boolean,
	"reasoning" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_summaries" ADD CONSTRAINT "user_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_history" ADD CONSTRAINT "scan_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_history" ADD CONSTRAINT "scan_history_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_history" ADD CONSTRAINT "scan_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scanned_labels" ADD CONSTRAINT "scanned_labels_scan_id_scan_history_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scanned_labels" ADD CONSTRAINT "scanned_labels_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scanned_labels" ADD CONSTRAINT "scanned_labels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scanned_ingredients" ADD CONSTRAINT "scanned_ingredients_scan_id_scan_history_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scanned_ingredients" ADD CONSTRAINT "scanned_ingredients_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scanned_ingredients" ADD CONSTRAINT "scanned_ingredients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scanned_prescriptions" ADD CONSTRAINT "scanned_prescriptions_scan_id_scan_history_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scanned_prescriptions" ADD CONSTRAINT "scanned_prescriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_prescription_id_scanned_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."scanned_prescriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allergen_flags" ADD CONSTRAINT "allergen_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allergen_flags" ADD CONSTRAINT "allergen_flags_scan_id_scan_history_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_scan_id_scan_history_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan_history"("id") ON DELETE set null ON UPDATE no action;