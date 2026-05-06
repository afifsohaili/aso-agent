
Current Phase: {{phase_title}}
Task Being Reviewed: #{{task_id}} - {{task_description}}

Implementation Summary:
{{implementation_summary}}

Files Changed:
{{files_changed}}

Review ONLY the implementation of this single task. Check for:
1. ALL tests must pass - this is ABSOLUTE. If ANY test fails (even pre-existing ones), review_passed MUST be false.
2. Tests are meaningful.
3. Negative test cases are covered.
4. Code follows project style and conventions
5. No security issues introduced
6. Implementation satisfies the plan for this task

The stop condition for this project requires ALL tests to pass. Do not excuse pre-existing failures. If tests failed or the implementation is incomplete, list specific issues.
