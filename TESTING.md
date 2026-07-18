# pgCompare Testing Guide

## Testing Requirement

Before submitting an enhancement or fix, the tests outline in this guide must be performed to ensure that the new issues are not introduced.  Evidence of the tests should be included in the pull request (summary output of compare).

## Unit Tests (JUnit)

In addition to the database compare tests below, the project includes fast JUnit unit tests (no database required) that lock in the exact compare/hash SQL generated for each data type and platform. These act as a regression guard: cross-platform correctness depends on the source and target producing byte-identical hash input, so any unintended change to a generated expression is a correctness bug.

Always run the unit tests before committing changes to `DataTypeCastingUtils`, the column metadata builders, or the threading classes.

### Run all unit tests
    mvn test

### Run only the data type casting (golden-master) tests
    mvn test -Dtest=DataTypeCastingUtilsTest

### Run a single nested group or method
    mvn test -Dtest='DataTypeCastingUtilsTest$TimestampCasting'
    mvn test -Dtest='DataTypeCastingUtilsTest#postgresTimestamptzGetsUtcConversion'

### Run tests as part of a full build
    mvn install                # compiles, runs tests, builds the jar
    mvn install -DskipTests    # skip tests (used by the Docker image build)

### Reading results
- The console reports `Tests run: N, Failures: 0, Errors: 0` followed by `BUILD SUCCESS` or `BUILD FAILURE`.
- On failure, Surefire prints the exact string diff (`expected: <...> but was: <...>`), pinpointing which generated SQL changed.
- Detailed reports are written to `target/surefire-reports/`.

If a casting change is intentional, update the corresponding expected value in the test AND re-validate against real source/target databases using the database test plan below.

## Test Data

As part of the Data Validation Tool project (https://github.com/GoogleCloudPlatform/professional-services-data-validator), the Google Database Black belt Team has created a great sample set of tables and data to test any data compare tool with.  These tables are recommended, but not required, for use in testing any pull requests.

Evidence, summary of compare output vs expectations, should be included in any pull request.  The sample data used must include all core types (character, number, timestamp, etc.).  In addition, the test must be performed on two different database platforms.

## Test Plan
Deploy the sample data under the database directory to the appropriate database or use the DVT sample data.

### Test 1:  Initialize Database
    pgcompare --init

### Test 2:  Discovery
    pgcompare --discovery hr

### Test 3:  Reconcile All
    pgcompare --reconcile --batch 0

### Test 4:  Create Out of Sync and Reconcile
    UPDATE hr.location SET location_code=1234567890.1234567 WHERE city='Miami';
    DELETE FROM hr.location WHERE city='Chicago';
    INSERT INTO hr.location (longitude, latitude, city, state, zip, location_code) VALUES (-81.655647, 30.332184, 'Jacksonville', 'FL', 32257, 1234567890.123456789);
    
    pgcompare --reconcile --batch 0

### Test 5:  Check Out of Sync
    pgcompare --reconcile --batch 0 --check

### Test 6:  Test with Database Hash disabled
    pgcompare --reconcile --batch 0
