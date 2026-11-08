# Engineering review checklist

1. Compare observable behavior against the accepted requirements and check
   failure, authorization, recovery and race cases that affect the change.
2. Check ownership and coupling against the [architecture policy](architecture-policy.md)
   and accepted ADRs. Check API and event compatibility, trust boundaries and
   data migrations.
3. For visible changes, use [frontend quality](frontend-quality.md) to review
   interaction, accessibility and state handling.
4. Compare the scope of the diff with the reported test and verification
   evidence. Report assumptions and checks still needed.

Order findings by impact and likelihood. Give the affected path, the triggering
scenario, the observable impact, and a practical correction. Distinguish
source-confirmed findings from suspected or reproduced runtime behavior.
Prioritize security, data integrity and unavailable critical flows before
maintainability or style.
