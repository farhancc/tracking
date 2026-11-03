CREATE TABLE "finance_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"interest_rate_pct" numeric(5, 2),
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_accounts_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "finance_accounts_user_name_key" UNIQUE("user_id","name"),
	CONSTRAINT "finance_accounts_kind_check" CHECK ("finance_accounts"."kind" in ('cash', 'savings', 'emergency_fund', 'investment', 'retirement', 'property', 'other_asset', 'loan', 'credit_card', 'mortgage', 'other_debt')),
	CONSTRAINT "finance_accounts_name_check" CHECK (length(btrim("finance_accounts"."name")) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "finance_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"account_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"balance" numeric(20, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_balances_account_date_key" UNIQUE("account_id","as_of"),
	CONSTRAINT "finance_balances_balance_check" CHECK ("finance_balances"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "finance_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"spent_on" date NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"essential" boolean NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_expenses_category_check" CHECK ("finance_expenses"."category" in ('housing', 'food', 'transport', 'utilities', 'insurance', 'health', 'debt_repayment', 'education', 'family', 'entertainment', 'travel', 'business', 'other')),
	CONSTRAINT "finance_expenses_amount_check" CHECK ("finance_expenses"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "finance_forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"month" date NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_forecasts_kind_check" CHECK ("finance_forecasts"."kind" in ('income', 'expense')),
	CONSTRAINT "finance_forecasts_month_check" CHECK (extract(day from "finance_forecasts"."month") = 1),
	CONSTRAINT "finance_forecasts_amount_check" CHECK ("finance_forecasts"."amount" > 0),
	CONSTRAINT "finance_forecasts_label_check" CHECK (length(btrim("finance_forecasts"."label")) between 1 and 200),
	CONSTRAINT "finance_forecasts_source_check" CHECK ("finance_forecasts"."source" is null or ("finance_forecasts"."kind" = 'income' and "finance_forecasts"."source" in ('salary', 'business', 'product', 'course', 'consulting', 'other')))
);
--> statement-breakpoint
CREATE TABLE "finance_income" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT app.current_user_id() NOT NULL,
	"received_on" date NOT NULL,
	"source" text NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"recurring" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_income_source_check" CHECK ("finance_income"."source" in ('salary', 'business', 'product', 'course', 'consulting', 'other')),
	CONSTRAINT "finance_income_amount_check" CHECK ("finance_income"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "finance_settings" (
	"user_id" uuid PRIMARY KEY DEFAULT app.current_user_id() NOT NULL,
	"currency" char(3) NOT NULL,
	"withdrawal_rate_pct" numeric(4, 2) DEFAULT 4 NOT NULL,
	"annual_expenses_estimate" numeric(20, 2),
	"expected_return_pct" numeric(4, 2) DEFAULT 5 NOT NULL,
	"emergency_months" numeric(4, 1) DEFAULT 6 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_settings_currency_check" CHECK ("finance_settings"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "finance_settings_withdrawal_check" CHECK ("finance_settings"."withdrawal_rate_pct" > 0 and "finance_settings"."withdrawal_rate_pct" <= 20),
	CONSTRAINT "finance_settings_return_check" CHECK ("finance_settings"."expected_return_pct" between -20 and 30),
	CONSTRAINT "finance_settings_emergency_check" CHECK ("finance_settings"."emergency_months" between 0 and 60),
	CONSTRAINT "finance_settings_expenses_check" CHECK ("finance_settings"."annual_expenses_estimate" is null or "finance_settings"."annual_expenses_estimate" > 0)
);
--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_balances" ADD CONSTRAINT "finance_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_balances" ADD CONSTRAINT "finance_balances_account_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."finance_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_expenses" ADD CONSTRAINT "finance_expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_forecasts" ADD CONSTRAINT "finance_forecasts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_income" ADD CONSTRAINT "finance_income_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_settings" ADD CONSTRAINT "finance_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_expenses_user_date_idx" ON "finance_expenses" USING btree ("user_id","spent_on");--> statement-breakpoint
CREATE INDEX "finance_forecasts_user_month_idx" ON "finance_forecasts" USING btree ("user_id","month");--> statement-breakpoint
CREATE INDEX "finance_income_user_date_idx" ON "finance_income" USING btree ("user_id","received_on");