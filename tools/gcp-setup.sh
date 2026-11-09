#!/usr/bin/env bash
# One-time: lets this site's GitHub workflows manage the Google/Firebase project, with no keys.
# Run in Google Cloud Shell:   curl -sL jaswin90.github.io/setup.sh | bash
# It creates a service account (Firebase Admin, Service Usage Admin, API Keys Admin) that only
# GitHub Actions of the repository jaswin90/jaswin90.github.io can use (Workload Identity
# Federation). Safe to run again.
set -euo pipefail
step() { echo; echo "== $*"; }
# Retry a command: a just-created service account takes a little while to be usable.
retry() { local n=0; until "$@"; do n=$((n+1)); if [ $n -ge 6 ]; then echo "Still failing after retries: $*"; return 1; fi; echo "  (not ready yet, retrying in 10 s…)"; sleep 10; done; }
PROJECT=jaswin-s-library
REPO=jaswin90/jaswin90.github.io
SA_NAME=site-automation
SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
echo "Setting up automation for project $PROJECT (repository $REPO)…"
step "Project"
gcloud config set project "$PROJECT" -q >/dev/null
NUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
step "Enabling the services used for keyless sign-in"
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com serviceusage.googleapis.com -q
step "Service account $SA"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$SA_NAME" --display-name="Site automation (GitHub)" -q
sleep 5
step "Granting roles"
for r in roles/firebase.admin roles/serviceusage.serviceUsageAdmin roles/serviceusage.apiKeysAdmin; do
  echo "  $r"
  retry gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="$r" --condition=None -q >/dev/null
done
step "GitHub connection (Workload Identity Federation)"
gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create github --location=global --display-name="GitHub" -q
gcloud iam workload-identity-pools providers describe github --location=global --workload-identity-pool=github >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc github --location=global --workload-identity-pool=github \
    --display-name="GitHub Actions" --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='$REPO'" -q
step "Allowing only $REPO to use the service account"
retry gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUM/locations/global/workloadIdentityPools/github/attribute.repository/$REPO" -q >/dev/null
echo
echo "All set. Project number: $NUM. Go back to Claude and say: done"
