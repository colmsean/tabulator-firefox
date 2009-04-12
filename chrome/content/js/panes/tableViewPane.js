
// Format an array of RDF statements as an HTML table.

function renderTableViewPane(doc, statements) {
    var RDFS_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
    var RDFS_LITERAL = "http://www.w3.org/2000/01/rdf-schema#Literal";

    // Predicates that are never made into columns:

    var FORBIDDEN_COLUMNS = {
        "http://www.w3.org/2002/07/owl#sameAs": true,
    };

    // Number types defined in the XML schema:

    var XSD_NUMBER_TYPES = {
        "http://www.w3.org/2001/XMLSchema#decimal": true,
        "http://www.w3.org/2001/XMLSchema#float": true,
        "http://www.w3.org/2001/XMLSchema#double": true,
        "http://www.w3.org/2001/XMLSchema#integer": true,
        "http://www.w3.org/2001/XMLSchema#nonNegativeInteger": true,
        "http://www.w3.org/2001/XMLSchema#positiveInteger": true,
        "http://www.w3.org/2001/XMLSchema#nonPositiveInteger": true,
        "http://www.w3.org/2001/XMLSchema#negativeInteger": true,
        "http://www.w3.org/2001/XMLSchema#long": true,
        "http://www.w3.org/2001/XMLSchema#int": true,
        "http://www.w3.org/2001/XMLSchema#short": true,
        "http://www.w3.org/2001/XMLSchema#byte": true,
        "http://www.w3.org/2001/XMLSchema#unsignedLong": true,
        "http://www.w3.org/2001/XMLSchema#unsignedInt": true,
        "http://www.w3.org/2001/XMLSchema#unsignedShort": true,
        "http://www.w3.org/2001/XMLSchema#unsignedByte": true
    };

    // Predicates that indicate an image:

    var IMAGE_TYPES = {
        "http://xmlns.com/foaf/0.1/Image": true,
    };

    // Use queries to render the table, currently experimental:
 
    var USE_QUERIES = false;

    var subjectIdCounter = 0;
    var globalColumns, allType, types;
    var typeSelectorDiv, addColumnDiv;

    [globalColumns, allType, types] = calculateTable(statements);

    var resultDiv = doc.createElement("div");
    resultDiv.className = "tableViewPane";

    resultDiv.appendChild(generateControlBar());
    typeSelectorDiv.appendChild(generateTypeSelector(allType, types));

    var tableDiv = doc.createElement("div");
    resultDiv.appendChild(tableDiv);

    // Find the most common type and select it by default

    var mostCommonType = getMostCommonType(types);

    if (mostCommonType != null) {
        buildFilteredTable(mostCommonType);
    } else {
        buildFilteredTable(allType);
    }

    return resultDiv;

    // Generate the control bar displayed at the top of the screen.

    function generateControlBar() {
        var result = doc.createElement("table");
        var tr = doc.createElement("tr");

        typeSelectorDiv = doc.createElement("td");
        tr.appendChild(typeSelectorDiv);

        addColumnDiv = doc.createElement("td");
        tr.appendChild(addColumnDiv);

        result.appendChild(tr);

        return result;
    }

    // Add the SELECT details to the query being built.

    function addSelectToQuery(query, rowVar, type) {
        var selectedColumns = type.getColumns();
        query.vars.push(rowVar);

        for (var i=0; i<selectedColumns.length; ++i) {
            // TODO: autogenerate nicer names for variables
            // variables have to be unambiguous

            var variable = kb.variable("_col" + i);

            query.vars.push(variable);
            selectedColumns[i].setVariable(variable);
        }
    }

    // Add WHERE details to the query being built.

    function addWhereToQuery(query, rowVar, type) {
        var queryType = type.type;

        if (queryType == null) {
            queryType = kb.variable("_any");
        }

        // _row a type
        query.pat.add(rowVar,
                      tabulator.ns.rdf("type"),
                      queryType);
    }

    // Generate OPTIONAL column selectors.

    function addColumnsToQuery(query, rowVar, type) {
        var selectedColumns = type.getColumns();

        for (var i=0; i<selectedColumns.length; ++i) {
            var column = selectedColumns[i];

            var formula = kb.formula();

            formula.add(rowVar,
                        column.predicate,
                        column.getVariable());

            query.pat.optional.push(formula);
        }
    }

    // Generate a query object from the currently-selected type
    // object.

    function generateQuery(type) {
        var query = new Query();
        var rowVar = kb.variable("_row");

        addSelectToQuery(query, rowVar, type);
        addWhereToQuery(query, rowVar, type);
        addColumnsToQuery(query, rowVar, type);

        return query;
    }

    // Build the contents of the tableDiv element, filtered according
    // to the specified type.

    function buildFilteredTable(type) {

        // Generate "add column" cell.

        clearElement(addColumnDiv);
        addColumnDiv.appendChild(generateColumnAddDropdown(type));

        // Clear the tableDiv element.

        clearElement(tableDiv);

        var query = generateQuery(type);

        // Render the HTML table.

        var htmlTable;

        if (USE_QUERIES) {
            htmlTable = renderTableForQuery(query, type);
        } else {
            htmlTable = renderTableForType(type);
        }

        tableDiv.appendChild(htmlTable);
    }

    // Remove all subelements of the specified element.

    function clearElement(element) {
        while (element.childNodes.length > 0) {
            element.removeChild(element.childNodes[0]);
        }
    }

    // A SubjectType is created for each rdf:type discovered.

    function SubjectType(type) {
        this.type = type;
        this.rows = [];
        this.columns = null;
        this.allColumns = null;

        // Get a list of all columns used by this type.

        this.getAllColumns = function() {

            // The first time this function is called, we must get
            // a list of all columns used by this type.

            if (this.allColumns == null) {
                var filteredColumns = filterColumns(globalColumns, this.rows);

                // Convert columns to a flat list, and sort, so that the most
                // common columns are on the left.

                this.allColumns = getColumnsList(filteredColumns);
                sortColumns(this.allColumns);
            }

            return this.allColumns;
        }

        // Get a list of the current columns used by this type
        // (subset of allColumns)

        this.getColumns = function() {

            // The first time through, get a list of all the columns
            // and select only the six most popular columns.

            if (this.columns == null) {
                var allColumns = this.getAllColumns();
                this.columns = allColumns.slice(0, 7);
            }

            return this.columns;
        }

        // Get a list of unused columns

        this.getUnusedColumns = function() {
            var allColumns = this.getAllColumns();
            var columns = this.getColumns();

            var result = [];

            for (var i=0; i<allColumns.length; ++i) {
                if (columns.indexOf(allColumns[i]) == -1) {
                    result.push(allColumns[i]);
                }
            }

            return result;
        }

        this.addColumn = function(column) {
            this.columns.push(column);
        }

        this.removeColumn = function(column) {
            this.columns = this.columns.filter(function(x) {
                return x != column;
            })
        }

        this.getLabel = function() {
            return label(this.type);
        }

        this.addUse = function(row) {
            this.rows.push(row);
        }
    }

    function getRangeForPredicate(predicate) {
        return kb.any(predicate, tabulator.ns.rdfs("range"));
    }

    // Class representing a column in the table.

    function Column(predicate) {
        this.predicate = predicate;
        this.useCount = 0;
        this.range = getRangeForPredicate(predicate);

        // If the range is unknown, but we just get literals in this
        // column, then we can generate a literal selector.

        this.possiblyLiteral = true;

        // If the range is unknown, but we just get literals and they
        // match the regular expression for numbers, we can generate
        // a number selector.

        this.possiblyNumber = true;

        // Check values as they are read.  If we don't know what the
        // range is, we might be able to infer that it is a literal
        // if all of the values are literals.  Similarly, we might
        // be able to determine if the literal values are actually
        // numbers (using regexps).

        this.checkValue = function(value) {
            var termType = value.termType
            if (this.possiblyLiteral && termType != "literal" && termType != "symbol") {
                this.possiblyNumber = false;
                this.possiblyLiteral = false;
            } else if (this.possiblyNumber) {
                if (termType != "literal") {
                    this.possiblyNumber = false;
                } else {
                    var literalValue = value.value;

                    if (!literalValue.match(/^\-?\d+(\.\d*)?$/)) {
                        this.possiblyNumber = false;
                    }
                }
            }
        }

        this.getVariable = function() {
            return this.variable;
        }

        this.setVariable = function(variable) {
            this.variable = variable;
        }

        this.addUse = function() {
            this.useCount += 1;
        }

        this.getLabel = function() {
            return label(this.predicate);
        }

        this.getRange = function() {
            return this.range;
        }

        this.filterFunction = function() {
            return true;
        }

        this.sortKey = function() {
            return label(this.predicate).toLowerCase();
        }

        this.isImageColumn = function() {
            return this.range != null && this.range.uri in IMAGE_TYPES;
        }
    }

    // Convert an object to an array.

    function objectToArray(obj, filter) {
        var result = [];

        for (var property in obj) {
            var value = obj[property];

            if (!filter || filter(property, value)) {
                result.push(value);
            }
        }

        return result;
    }

    // Get the list of valid columns from the columns object.

    function getColumnsList(columns) {
        return objectToArray(columns);
    }

    // Generate an <option> in a drop-down list.

    function optionElement(label, value) {
        var result = doc.createElement("option");

        result.setAttribute("value", value);
        result.appendChild(doc.createTextNode(label));

        return result;
    }

    // Generate drop-down list box for choosing type of data displayed

    function generateTypeSelector(allType, types) {
        var resultDiv = doc.createElement("div");

        resultDiv.appendChild(doc.createTextNode("Select type: "));

        var dropdown = doc.createElement("select");

        dropdown.appendChild(optionElement("All types", "null"));

        for (var uri in types) {
            dropdown.appendChild(optionElement(types[uri].getLabel(), uri));
        }

        dropdown.addEventListener("click", function() {
            var type;

            if (dropdown.value == "null") {
                type = allType;
            } else {
                type = types[dropdown.value];
            }

            typeSelectorChanged(type);
        }, false);

        resultDiv.appendChild(dropdown);

        return resultDiv;
    }

    // Callback invoked when the type selector drop-down list is changed.

    function typeSelectorChanged(selectedType) {
        buildFilteredTable(selectedType);
    }

    // Build drop-down list to add a new column

    function generateColumnAddDropdown(type) {
        var resultDiv = doc.createElement("div");

        var unusedColumns = type.getUnusedColumns();

        unusedColumns.sort(function(a, b) {
            var aLabel = a.sortKey();
            var bLabel = b.sortKey();
            return (aLabel > bLabel) - (aLabel < bLabel);
        });

        // If there are no unused columns, the div is empty.

        if (unusedColumns.length > 0) {

            resultDiv.appendChild(doc.createTextNode("Add column: "));

            // Build dropdown list of unused columns.

            var dropdown = doc.createElement("select");

            dropdown.appendChild(optionElement("", "-1"));

            for (var i=0; i<unusedColumns.length; ++i) {
                var column = unusedColumns[i];
                dropdown.appendChild(optionElement(column.getLabel(), "" + i));
            }

            resultDiv.appendChild(dropdown);

            // Invoke callback when the dropdown is changed, to add
            // the column and reload the table.

            dropdown.addEventListener("click", function() {
                var columnIndex = new Number(dropdown.value);

                if (columnIndex >= 0) {
                    type.addColumn(unusedColumns[columnIndex]);
                    buildFilteredTable(type);
                }
            }, false);
        }

        return resultDiv;
    }

    // Get a unique ID for the given subject.  This is normally the
    // URI; if the subject has no URI, a unique ID is assigned.

    function getSubjectId(subject) {
        if ("uri" in subject) {
            return subject.uri;
        } else if ("_subject_id" in subject) {
            return subject._subject_id;
        } else {
            var result = "" + subjectIdCounter;
            subject._subject_id = result;
            ++subjectIdCounter;
            return result;
        }
    }

    // Find the row for a given subject, creating a new row if necessary.

    function getRowForSubject(allType, subjects, subject) {

        var row;
        var subjectId = getSubjectId(subject);

        if (subjectId in subjects) {
            row = subjects[subjectId];
        } else {
            row = { _subject: subject };
            allType.addUse(row);
            subjects[subjectId] = row;
        }

        return row;
    }

    // Find the column for a given predicate, creating a new column object
    // if necessary.

    function getColumnForPredicate(columns, predicate) {

        var column;

        if (predicate.uri in columns) {
            column = columns[predicate.uri];
        } else {
            column = new Column(predicate);
            columns[predicate.uri] = column;
        }

        return column;
    }

    // Find a type by its URI, creating a new SubjectType object if
    // necessary.

    function getTypeForObject(types, type) {
        var subjectType;

        if (type.uri in types) {
            subjectType = types[type.uri];
        } else {
            subjectType = new SubjectType(type);
            types[type.uri] = subjectType;
        }

        return subjectType;
    }

    // Build table information from parsing RDF statements.

    function calculateTable(statements) {

        // Look up table to find rows that have been added to the result
        // array, by subject URI.

        var subjects = {};

        // Columns, indexed by subject URI.  See Column class.

        var columns = {};

        // rdf:type properties of subjects, indexed by URI for the type.

        var types = {};

        // Special type that captures all rows.

        var allType = new SubjectType(null);

        // Process all statements:

        for (var i=0; i<statements.length; ++i) {

            var predicate = statements[i].predicate;

            // Ignore certain columns:

            if (FORBIDDEN_COLUMNS[predicate.uri]) {
                continue;
            }

            // Find the row for the subject of this statement.

            var row = getRowForSubject(allType, subjects, statements[i].subject);

            // Find the column for this predicate.

            var column = getColumnForPredicate(columns, predicate);

            // Collect rdf:type specifications.  rdf:type is not added
            // as a column.

            if (predicate.uri == RDFS_TYPE) {
                var type = getTypeForObject(types, statements[i].object);
                type.addUse(row);
            } else {

                // Add this triple.
                // We have to take into account cases like foaf:knows,
                // where a property can have multiple values, so we
                // store a list of values.  The first time adding a
                // value, initialise from an empty list.

                if (!(predicate.uri in row)) {
                    row[predicate.uri] = [];

                    // Update use count for this column.

                    column.addUse();
                }

                var value = statements[i].object;

                column.checkValue(value);
                row[predicate.uri].push(value);
            }
        }

        return [columns, allType, types];
    }

    // Sort the list of columns by the most common columns.

    function sortColumns(columns) {
        function sortFunction(a, b) {
            return (a.useCount < b.useCount) - (a.useCount > b.useCount);
        }

        columns.sort(sortFunction);
    }

    // Create the delete button for a column.

    function renderColumnDeleteButton(type, column) {
        var button = doc.createElement("a");

        button.appendChild(doc.createTextNode("[x]"));

        button.addEventListener("click", function() {
            type.removeColumn(column);
            buildFilteredTable(type);
        }, false);

        return button;
    }

    // Render the table header for the HTML table.

    function renderTableHeader(type) {
        var tr = doc.createElement("tr");
        var columns = type.getColumns();

        /* Empty header for link column */
        var linkTd = doc.createElement("th");
        tr.appendChild(linkTd);

        /*
        var labelTd = doc.createElement("th");
        labelTd.appendChild(doc.createTextNode("*label*"));
        tr.appendChild(labelTd);
        */

        for (var i=0; i<columns.length; ++i) {
            var th = doc.createElement("th");
            var column = columns[i];

            //alert(column.getRange());
            th.appendChild(doc.createTextNode(column.getLabel()));

            th.appendChild(renderColumnDeleteButton(type, column));

            tr.appendChild(th);
        }

        return tr;
    }

    // Sort the rows in the rendered table by data from a specific
    // column, using the provided sort function to compare values.

    function applyColumnSort(rows, column, sortFunction, reverse) {
        var columnUri = column.predicate.uri;

        // Sort the rows array.
        rows.sort(function(row1, row2) {
            var row1Value = null, row2Value = null;

            if (columnUri in row1) {
                row1Value = row1[columnUri][0];
            }
            if (columnUri in row2) {
                row2Value = row2[columnUri][0];
            }

            var result = sortFunction(row1Value, row2Value);

            if (reverse) {
                return -result;
            } else {
                return result;
            }
        })

        // Remove all rows from the table:

        var parentTable = rows[0]._htmlRow.parentNode;

        for (var i=0; i<rows.length; ++i) {
            parentTable.removeChild(rows[i]._htmlRow);
        }

        // Add back the rows in the new sorted order:

        for (var i=0; i<rows.length; ++i) {
            parentTable.appendChild(rows[i]._htmlRow);
        }
    }

    // Filter the list of rows based on the selectors for the 
    // columns.

    function applyColumnFilters(rows, columns) {

        // Apply filterFunction to each row.

        for (var r=0; r<rows.length; ++r) {
            var row = rows[r];
            var rowDisplayed = true;

            // Check the filter functions for every column.
            // The row should only be displayed if the filter functions
            // for all of the columns return true.

            for (var c=0; c<columns.length; ++c) {
                var column = columns[c];
                var columnUri = column.predicate.uri;

                var columnValue = null;

                if (columnUri in row) {
                    columnValue = row[columnUri][0];
                }

                if (!column.filterFunction(columnValue)) {
                    rowDisplayed = false;
                    break;
                }
            }

            // Show or hide the HTML row according to the result
            // from the filter function.

            var htmlRow = row._htmlRow;

            if (rowDisplayed) {
                htmlRow.style.display = "";
            } else {
                htmlRow.style.display = "none";
            }
        }
    }

    // Sort by literal value

    function literalSort(rows, column, reverse) {
        function literalToString(colValue) {
            if (colValue != null) {
                return colValue.value;
            } else {
                return "";
            }
        }

        function literalCompare(value1, value2) {
            var strValue1 = literalToString(value1);
            var strValue2 = literalToString(value2);

            if (strValue1 < strValue2) {
                return -1;
            } else if (strValue1 > strValue2) {
                return 1;
            } else {
                return 0;
            }
        }

        applyColumnSort(rows, column, literalCompare, reverse);
    }

    // Generates a selector for an RDF literal column.

    function renderLiteralSelector(rows, columns, column) {
        var result = doc.createElement("div");

        var textBox = doc.createElement("input");
        textBox.setAttribute("type", "text");
        textBox.style.width = "70%";

        result.appendChild(textBox);

        var sort1 = doc.createElement("span");
        sort1.appendChild(doc.createTextNode("\u25BC"));
        sort1.addEventListener("click", function() {
            literalSort(rows, column, false);
        }, false)
        result.appendChild(sort1);

        var sort2 = doc.createElement("span");
        sort2.appendChild(doc.createTextNode("\u25B2"));
        sort2.addEventListener("click", function() {
            literalSort(rows, column, true);
        }, false)
        result.appendChild(sort2);

        var substring = null;

        // Filter the table to show only rows that have a particular 
        // substring in the specified column.

        column.filterFunction = function(colValue) {
            if (substring == null) {
                return true;
            } else if (colValue == null) {
                return false;
            } else {
                var literalValue;

                if (colValue.termType == "literal") {
                    literalValue = colValue.value;
                } else if (colValue.termType == "symbol") {
                    literalValue = colValue.uri;
                } else {
                    literalValue = "";
                }

                return literalValue.toLowerCase().indexOf(substring) >= 0;
            }
        }

        textBox.addEventListener("keyup", function() {
            if (textBox.value != "") {
                substring = textBox.value.toLowerCase();
            } else {
                substring = null;
            }

            applyColumnFilters(rows, columns);
        }, false);

        return result;
    }

    // Generates a dropdown selector for enumeration types.

    function renderEnumSelector(rows, columns, column, statements) {
        var result = doc.createElement("div");

        var dropdown = doc.createElement("select");

        dropdown.appendChild(optionElement("(All)", "-1"));

        // "statements" is a list of matching statements for:
        //
        // range owl:oneOf <collection>
        //
        // The collection then gives a list of valid values for this
        // enumeration.
        //
        // Just assume that the first matching statement is the list.

        var list = statements[0].object.elements;

        for (var i=0; i<list.length; ++i) {
            var value = list[i];

            dropdown.appendChild(optionElement(label(value), i));
        }

        result.appendChild(dropdown);

        // Select based on an enum value.

        var searchValue = null;

        column.filterFunction = function(colValue) {
            return searchValue == null ||
                   (colValue != null && searchValue.uri == colValue.uri);
        }

        dropdown.addEventListener("click", function() {
            var index = new Number(dropdown.value);
            if (index < 0) {
                searchValue = null;
            } else {
                searchValue = list[index];
            }
            applyColumnFilters(rows, columns);
        }, false);

        return result;
    }

    // Selector for XSD number types.

    function renderNumberSelector(rows, columns, column) {
        var result = doc.createElement("div");

        var minSelector = doc.createElement("input");
        minSelector.setAttribute("type", "text");
        minSelector.style.width = "40px";
        result.appendChild(minSelector);

        var maxSelector = doc.createElement("input");
        maxSelector.setAttribute("type", "text");
        maxSelector.style.width = "40px";
        result.appendChild(maxSelector);

        // Select based on minimum/maximum limits.

        var min = null;
        var max = null;

        column.filterFunction = function(colValue) {
            if (colValue != null) {
                colValue = new Number(colValue);
            }

            if (min != null && (colValue == null || colValue < min)) {
                return false;
            }
            if (max != null && (colValue == null || colValue > max)) {
                return false;
            }

            return true;
        }

        // When the values in the boxes are changed, update the 
        // displayed columns.

        function eventListener() {
            if (minSelector.value == "") {
                min = null;
            } else {
                min = new Number(minSelector.value);
            }

            if (maxSelector.value == "") {
                max = null;
            } else {
                max = new Number(maxSelector.value);
            }

            applyColumnFilters(rows, columns);
        }

        minSelector.addEventListener("keyup", eventListener, false);
        maxSelector.addEventListener("keyup", eventListener, false);

        return result;
    }

    // Fallback attempts at generating a selector if other attempts fail.

    function fallbackRenderTableSelector(rows, columns, column) {

        // Have all values matched as numbers?

        if (column.possiblyNumber) {
            return renderNumberSelector(rows, columns, column);
        }

        // Have all values been literals?

        if (column.possiblyLiteral) {
            return renderLiteralSelector(rows, columns, column);
        }

        // Show the range, for debugging.
        if (false) {
            var range = column.getRange();
            if (range != null)
                return doc.createTextNode(range.uri);
        }
        return null;
    }

    // Render a selector for a given row.

    function renderTableSelector(rows, columns, column) {

        // What type of data is in this column?  Check the range for 
        // this predicate.

        var range = column.getRange();

        if (range == null) {
            return fallbackRenderTableSelector(rows, columns, column);
        }

        // Is this a number type?
        // Alternatively, is this an rdf:Literal type where all of 
        // the values match as numbers?

        if (column.possiblyNumber || range.uri in XSD_NUMBER_TYPES) {
            return renderNumberSelector(rows, columns, column);
        }

        // rdf:Literal?

        if (range.uri == RDFS_LITERAL) {
            return renderLiteralSelector(rows, columns, column);
        }

        // Is this an enumeration type?

        var matches = kb.statementsMatching(range,
                                            tabulator.ns.owl("oneOf"),
                                            undefined,
                                            undefined);

        if (matches.length > 0) {
 //           alert(range.uri + " owl:oneOf ? " + " -> " + matches.length);
            return renderEnumSelector(rows, columns, column, matches);
        }

        return fallbackRenderTableSelector(rows, columns, column);
    }

    // Generate the search selectors for the table columns.

    function renderTableSelectors(rows, columns) {
        var tr = doc.createElement("tr");
        tr.className = "selectors";

        // Empty link column

        tr.appendChild(doc.createElement("td"));

        // Generate selectors.

        for (var i=0; i<columns.length; ++i) {
            var td = doc.createElement("td");

            var selector = renderTableSelector(rows, columns, columns[i]);

            if (selector != null) {
                td.appendChild(selector);
            }

            tr.appendChild(td);
        }

        return tr;
    }

    function linkTo(uri, linkText) {
        var result = doc.createElement("a");
        result.setAttribute("href", uri);
        result.appendChild(doc.createTextNode(linkText));
        return result;
    }

    function linkToObject(obj) {
        var match = false;

        if (obj.uri != null) {
            match = obj.uri.match(/^mailto:(.*)/);
        }

        if (match) {
            return linkTo(obj.uri, match[1]);
        } else {
            return linkTo(obj.uri, label(obj));
        }
    }

    // Render an image

    function renderImage(obj) {
        var result = doc.createElement("img");
        result.setAttribute("src", obj.uri);

        // Set the height, so it appears as a thumbnail.
        result.style.height = "40px";
        return result;
    }

    // Render an individual RDF object to an HTML object displayed
    // in a table cell.

    function renderValue(obj, column) {
        if (obj.termType == "literal") {
            return doc.createTextNode(obj.value);
        } else if (obj.termType == "symbol" && column.isImageColumn()) {
            return renderImage(obj);
        } else if (obj.termType == "symbol" || obj.termType == "bnode") {
            return linkToObject(obj);
        } else {
            return doc.createTextNode("unknown termtype!");
        }
    }

    // Render a row of the HTML table, from the given row structure.
    // Note that unlike other functions, this renders into a provided
    // row (<tr>) element.

    function renderTableRowInto(tr, row, columns) {

        /* Link column, for linking to this subject. */

        var linkTd = doc.createElement("td");

        if ("uri" in row._subject) {
            linkTd.appendChild(linkTo(row._subject.uri, "\u2192"));
        }

        tr.appendChild(linkTd);

        /*
        var labelTd = doc.createElement("td");
        labelTd.appendChild(doc.createTextNode(label(row._subject)));
        tr.appendChild(labelTd);
        */

        // Create a <td> for each column (whether the row has data for that
        // column or not).

        for (var i=0; i<columns.length; ++i) {
            var column = columns[i];
            var td = doc.createElement("td");

            if (column.predicate.uri in row) {
                var objects = row[column.predicate.uri];

                for (var j=0; j<objects.length; ++j) {
                    var obj = objects[j];

                    td.appendChild(renderValue(obj, column));

                    if (j != objects.length - 1) {
                        td.appendChild(doc.createTextNode(",\n"));
                    }
                }
            }

            tr.appendChild(td);
        }

        // Save a reference to the HTML row in the row object.

        row._htmlRow = tr;

        return tr;
    }

    // Convert the table data to an HTML table.

    function renderTableForType(type) {
        var rows = type.rows;
        var columns = type.getColumns();

        var table = doc.createElement("table");

        table.appendChild(renderTableHeader(type));
        table.appendChild(renderTableSelectors(rows, columns));

        for (var i=0; i<rows.length; ++i) {
            var row = rows[i];

            var tr = doc.createElement("tr");
            renderTableRowInto(tr, row, columns);

            table.appendChild(tr);
        }

        return table;
    }

    // ========= Start of new query-based table rendering code =========

    // Check if a value is already stored in the list of values for
    // a cell (the query can sometimes find it multiple times)

    function valueInList(value, list) {
        var key = null;

        if (value.termType == "literal") {
            key = "value";
        } else if (value.termType == "symbol") {
            key = "uri";
        } else {
            return list.indexOf(value) >= 0;
        }

        // Check the list and compare keys:

        var i;

        for (i=0; i<list.length; ++i) {
            if (list[i].termType == value.termType
             && list[i][key] == value[key]) {
                return true;
            }
        }

        // Not found?

        return false;
    }

    // Update a row, add new values, and regenerate the HTML element
    // containing the values.

    function updateRow(row, columns, values, columnLookup) {

        var key;
        var needUpdate = false;

        for (key in values) {
            var value = values[key];

            // Which column is this for?

            var column = columnLookup[key];
            if (column == null) {
                // ?
                continue;
            }

            var columnUri = column.predicate.uri;

            // If this key is not already in the row, create a new entry
            // for it:

            if (!(columnUri in row)) {
                row[columnUri] = [];
            }

            // Possibly add this new value to the list, but don't
            // add it if we have already added it:

            if (!valueInList(value, row[columnUri])) {
                row[columnUri].push(value);
                needUpdate = true;
            }
        }

        // Regenerate the HTML row?

        if (needUpdate) {
            clearElement(row._htmlRow);
            renderTableRowInto(row._htmlRow, row, columns);
        }
    }

    // Generate lookup table mapping query variable names to
    // column objects.

    function generateColumnLookup(columns) {
        var result = {};
        var i;

        for (i=0; i<columns.length; ++i) {
            var column = columns[i];
            result[column.getVariable()] = column;
        }

        return result;
    }

    // Run a query and generate the table.
    // Returns an array of rows.  This will be empty when the function
    // first returns (as the query is performed in the background)

    function runQuery(query, rows, columns, table) {

        var columnLookup = generateColumnLookup(columns);

        // All rows found so far, indexed by _row value.
        // TODO: remove dependency on _row, as it cannot be relied on
        // for generic queries.

        var rowsLookup = {};

        kb.query(query, function(values) {

            var rowKey = values["?_row"];

            if (rowKey == null) alert("rowKey is null!");

            var rowKeyUri = rowKey.uri;

            // Do we have a row for this already?  If not, create a new row.
            var row;

            if (rowKeyUri in rowsLookup) {
                row = rowsLookup[rowKeyUri];
            } else {
                var tr = doc.createElement("tr");
                table.appendChild(tr);
                row = { _htmlRow: tr,
                        _subject: rowKey };
                rows.push(row);
                rowsLookup[rowKeyUri] = row;
            }

            // Add the new values to this row.

            updateRow(row, columns, values, columnLookup);
        })
    }

    // Generate a table from a query.
    // TODO: for the time being, this is still tied to rendering based on
    // a fixed type (rather than general queries).  This needs to be 
    // reworked to work based on generic queries, and infer the predicates
    // for columns by examining the query.

    function renderTableForQuery(query, type) {

        // TODO: infer columns from query, to allow generic queries

        var columns = type.getColumns();

        // Start with an empty list of rows; this will be populated
        // by the query.

        var rows = [];

        // Create table element and header.

        var table = doc.createElement("table");

        table.appendChild(renderTableHeader(type));
        table.appendChild(renderTableSelectors(rows, columns));

        // Run query.  Note that this is perform asynchronously; the
        // query runs in the background and this call does not block.

        runQuery(query, rows, columns, table);

        return table;
    }

    // Find the most common type of row

    function getMostCommonType(types) {
        var bestCount = -1;
        var best = null;

        for (var typeUri in types) {
            var type = types[typeUri];
            var rowCount = type.rows.length;

            if (rowCount > bestCount) {
                best = type;
                bestCount = rowCount;
            }
        }

        return best;
    }

    // Filter list of columns to only those columns used in the 
    // specified rows.

    function filterColumns(columns, rows) {
        var filteredColumns = {};

        // Copy columns from "columns" -> "filteredColumns", but only
        // those columns that are used in the list of rows specified.

        for (var columnUri in columns) {
            for (var i=0; i<rows.length; ++i) {
                if (columnUri in rows[i]) {
                    filteredColumns[columnUri] = columns[columnUri];
                    break;
                }
            }
        }

        return filteredColumns;
    }

}

/* Table view pane */

tabulator.panes.register({
    icon: iconPrefix + "icons/table.png",

    name: "table",

    label: function(subject) {

        // Returns true if the specified list of statements contains
        // information on a single subject.
 
        function singleSubject(statements) {
            var subj = null;

            for (var i=0; i<statements.length; ++i) {
                if (subj == null) {
                    subj = statements[i].subject;
                } else if (statements[i].subject != subj) {
                    return false;
                }
            }

            return true;
        }

        var sts = kb.statementsMatching(undefined, undefined, undefined,
                                        subject); 

        // If all the statements are on a single subject, a table view 
        // is futile, so hide the table view icon.

        if (!singleSubject(sts)) {
            return "Table view";
        } else {
            return null;
        }
    },

    render: function(subject, myDocument) {
        var div = myDocument.createElement("div");
        div.setAttribute('class', 'n3Pane'); // needs a proper class
        var sts = kb.statementsMatching(undefined, undefined, undefined, subject); 

        div.appendChild(renderTableViewPane(myDocument, sts));
        return div;
    }
})

