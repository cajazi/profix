import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// ─── Privacy Policy Page ──────────────────────────────────────
export function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link
        to="/dashboard"
        className="flex items-center gap-2 text-slate-400 hover:text-white transition mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-sm">P</span>
            </div>
            <span className="text-white font-bold text-xl">ProFix</span>
          </div>
          <h1 className="text-white text-3xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-slate-400 text-sm">Last updated: January 2025</p>
        </div>

        <div className="prose prose-invert max-w-none space-y-6 text-slate-300 text-sm leading-relaxed">
          <section>
            <h2 className="text-white text-lg font-semibold mb-2">1. Information We Collect</h2>
            <p>
              ProFix collects information you provide directly, including your name,
              email address, phone number, and identity documents for KYC verification.
              We also collect usage data, transaction records, and communications
              made through our platform.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">2. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul className="list-disc ml-6 space-y-1 mt-2">
              <li>Provide and improve our marketplace services</li>
              <li>Process payments and manage escrow transactions</li>
              <li>Verify your identity (KYC compliance)</li>
              <li>Send notifications about your jobs and contracts</li>
              <li>Prevent fraud and ensure platform security</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">3. Payment Information</h2>
            <p>
              ProFix uses Paystack as our payment processor. We do not store your
              card details on our servers. All payment data is encrypted and
              processed securely by Paystack in compliance with PCI DSS standards.
              Escrow funds are held securely until job completion is confirmed.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">4. Data Sharing</h2>
            <p>
              We do not sell your personal data. We may share data with:
            </p>
            <ul className="list-disc ml-6 space-y-1 mt-2">
              <li>Payment processors (Paystack) for transaction processing</li>
              <li>KYC verification providers for identity verification</li>
              <li>Law enforcement when required by law</li>
              <li>Other users only as necessary for service delivery</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">5. Data Security</h2>
            <p>
              We implement industry-standard security measures including encryption
              at rest and in transit, row-level security on our database, and
              regular security audits. However, no system is 100% secure and
              we encourage you to use strong passwords.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">6. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc ml-6 space-y-1 mt-2">
              <li>Access your personal data</li>
              <li>Correct inaccurate information</li>
              <li>Request deletion of your account and data</li>
              <li>Export your data in a portable format</li>
              <li>Opt out of marketing communications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">7. Account Deletion</h2>
            <p>
              You can request account deletion at any time through your Profile
              settings. We will process your request within 30 days. Note that
              some data may be retained for legal and financial compliance
              purposes for up to 7 years.
            </p>
            <div className="mt-3">
              <Link
                to="/profile"
                className="text-indigo-400 hover:text-indigo-300 underline text-sm"
              >
                Request account deletion →
              </Link>
            </div>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">8. Cookies</h2>
            <p>
              We use essential cookies for authentication and session management.
              We do not use tracking or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">9. Children's Privacy</h2>
            <p>
              ProFix is not intended for users under 18 years of age. We do not
              knowingly collect data from minors.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">10. Contact Us</h2>
            <p>
              For privacy-related questions or to exercise your rights, contact us at:
            </p>
            <p className="mt-2 text-indigo-400">privacy@profix.ng</p>
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Terms of Service Page ────────────────────────────────────
export function TermsOfServicePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link
        to="/dashboard"
        className="flex items-center gap-2 text-slate-400 hover:text-white transition mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-sm">P</span>
            </div>
            <span className="text-white font-bold text-xl">ProFix</span>
          </div>
          <h1 className="text-white text-3xl font-bold mb-2">Terms of Service</h1>
          <p className="text-slate-400 text-sm">Last updated: January 2025</p>
        </div>

        <div className="prose prose-invert max-w-none space-y-6 text-slate-300 text-sm leading-relaxed">
          <section>
            <h2 className="text-white text-lg font-semibold mb-2">1. Acceptance of Terms</h2>
            <p>
              By using ProFix, you agree to these Terms of Service. If you do not
              agree, please do not use our platform. We reserve the right to update
              these terms with notice to users.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">2. Platform Description</h2>
            <p>
              ProFix is a marketplace connecting job owners with professional workers
              for home services and contracting work. We provide the platform,
              communication tools, and secure escrow payment system.
              ProFix is not a party to any agreement between owners and workers.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">3. User Eligibility</h2>
            <ul className="list-disc ml-6 space-y-1">
              <li>You must be at least 18 years old</li>
              <li>You must provide accurate information during registration</li>
              <li>You must complete KYC verification to access payment features</li>
              <li>One account per person — multiple accounts are prohibited</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">4. Payments and Escrow</h2>
            <p>
              All payments must be made through ProFix's escrow system. Off-platform
              payments are strictly prohibited and void our dispute resolution
              protection. Platform commission is deducted from worker payouts as follows:
            </p>
            <ul className="list-disc ml-6 space-y-1 mt-2">
              <li>₦1 – ₦100,000: 5% commission</li>
              <li>₦100,001 – ₦500,000: 3.5% commission</li>
              <li>₦500,001 – ₦1,000,000: 2.5% commission</li>
              <li>Above ₦1,000,000: 1% commission</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">5. Prohibited Activities</h2>
            <ul className="list-disc ml-6 space-y-1">
              <li>Fraud, misrepresentation, or identity theft</li>
              <li>Off-platform payments to avoid commissions</li>
              <li>Harassment or abusive behaviour toward other users</li>
              <li>Creating fake reviews or manipulating ratings</li>
              <li>Using the platform for illegal activities</li>
              <li>Attempting to hack or disrupt the platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">6. Dispute Resolution</h2>
            <p>
              Either party may raise a dispute through the platform. Disputes freeze
              escrow funds until resolved by our admin team. Our team will review
              evidence from both parties and issue a resolution within 72 hours.
              ProFix's decision on disputes is final.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">7. Account Suspension</h2>
            <p>
              We reserve the right to suspend or terminate accounts that violate
              these terms, engage in fraudulent activity, or receive multiple
              verified complaints. Suspended users may appeal by contacting support.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">8. Limitation of Liability</h2>
            <p>
              ProFix is a marketplace platform and is not liable for the quality
              of work performed, disputes between users, or losses arising from
              off-platform transactions. Our liability is limited to the escrow
              amount held on our platform.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">9. Governing Law</h2>
            <p>
              These terms are governed by the laws of the Federal Republic of Nigeria.
              Any disputes shall be resolved in Nigerian courts.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">10. Contact</h2>
            <p>For questions about these terms, contact us at:</p>
            <p className="mt-2 text-indigo-400">legal@profix.ng</p>
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Account Deletion Page ────────────────────────────────────
export function AccountDeletionPage() {
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { profile, signOut } = useAuthStore();

  const handleSubmit = async () => {
    if (!reason) { toast.error("Please provide a reason"); return; }
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("deletion_requests")
        .insert({ user_id: profile!.id, reason, status: "pending" });
      if (error) throw error;
      setSubmitted(true);
      toast.success("Deletion request submitted. We will process it within 30 days.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">✅</span>
        </div>
        <h2 className="text-white text-2xl font-bold mb-2">Request Submitted</h2>
        <p className="text-slate-400 mb-6">
          Your account deletion request has been received. We will process it within 30 days.
          You will receive an email confirmation.
        </p>
        <Link to="/dashboard" className="text-indigo-400 hover:text-indigo-300 underline">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Link
        to="/profile"
        className="flex items-center gap-2 text-slate-400 hover:text-white transition mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Profile
      </Link>

      <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-6">
        <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
          <span className="text-2xl">⚠️</span>
        </div>
        <h1 className="text-white text-2xl font-bold mb-2">Delete Account</h1>
        <p className="text-slate-400 text-sm mb-6">
          This action is permanent. Your account and all associated data will be
          deleted within 30 days. Active contracts and pending payments must be
          resolved before deletion.
        </p>

        <div className="space-y-4">
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 space-y-2 text-sm text-red-300">
            <p className="font-semibold">Before you delete:</p>
            <ul className="list-disc ml-4 space-y-1">
              <li>Withdraw any available wallet balance</li>
              <li>Complete or cancel all active contracts</li>
              <li>Resolve any open disputes</li>
            </ul>
          </div>

          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Reason for leaving (required)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Please tell us why you are leaving..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none text-sm"
            />
          </div>

          <div className="flex gap-3">
            <Link
              to="/profile"
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl transition text-sm font-medium text-center"
            >
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              disabled={isLoading || !reason}
              className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Request Deletion"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// needed imports
import { useState } from "react";
import { useAuthStore } from "../../store/auth.store";
import { supabase } from "../../lib/supabase";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";