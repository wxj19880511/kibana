import _ from 'lodash';
import Papa from 'papaparse';
import modules from 'ui/modules';
import validateHeaders from './lib/validate_headers';
import template from './parse_csv_step.html';
import './styles/_add_data_parse_csv_step.less';
import numeral from '@spalger/numeral';

modules.get('apps/management')
  .directive('parseCsvStep', function (addDataMaxBytes) {
    return {
      restrict: 'E',
      template: template,
      scope: {
        file: '=',
        parseOptions: '=',
        samples: '='
      },
      bindToController: true,
      controllerAs: 'wizard',
      controller: function ($scope, debounce) {
        const maxSampleRows = 10;
        const maxSampleColumns = 20;

        this.maxBytesFormatted = numeral(addDataMaxBytes).format('0 b');

        this.delimiterOptions = [
          {
            label: 'comma',
            value: ','
          },
          {
            label: 'tab',
            value: '\t'
          },
          {
            label: 'space',
            value: ' '
          },
          {
            label: 'semicolon',
            value: ';'
          },
          {
            label: 'pipe',
            value: '|'
          }
        ];

        this.parse = debounce(() => {
          if (!this.file) return;
          let row = 1;
          let rows = [];
          let data = [];

          delete this.rows;
          delete this.columns;
          this.formattedErrors = [];
          this.formattedWarnings = [];

          if (this.file.size > addDataMaxBytes) {
            this.formattedErrors.push(
              `File size (${this.file.size} bytes) is greater than the configured limit of ${addDataMaxBytes} bytes`
            );
            return;
          }

          const config = _.assign(
            {
              header: true,
              dynamicTyping: true,
              skipEmptyLines: true,
              step: (results, parser) => {
                if (row > maxSampleRows) {
                  parser.abort();

                  // The complete callback isn't automatically called if parsing is manually aborted
                  config.complete();
                  return;
                }
                if (row === 1) {
                  // Check for header errors on the first row
                  const errors = validateHeaders(results.meta.fields);
                  _.forEach(errors, (error) => {
                    if (error.type === 'duplicate') {
                      this.formattedErrors.push(`Columns at positions [${error.positions}] have duplicate name "${error.fieldName}"`);
                    } else if (error.type === 'blank') {
                      this.formattedErrors.push(`Columns at positions [${error.positions}] must not be blank`);
                    }
                  });

                  if (results.meta.fields.length > maxSampleColumns) {
                    this.formattedWarnings.push(`Preview truncated to ${maxSampleColumns} columns`);
                  }

                  this.columns = results.meta.fields.slice(0, maxSampleColumns);
                  this.parseOptions = _.defaults({}, this.parseOptions, {delimiter: results.meta.delimiter});
                }

                this.formattedErrors = this.formattedErrors.concat(_.map(results.errors, (error) => {
                  return `${error.type} at line ${row + 1} - ${error.message}`;
                }));

                data = data.concat(results.data);

                rows = rows.concat(_.map(results.data, (row) => {
                  return _.map(this.columns, (columnName) => {
                    return row[columnName];
                  });
                }));

                ++row;
              },
              complete: () => {
                $scope.$apply(() => {
                  this.rows = rows;

                  if (_.isUndefined(this.formattedErrors) || _.isEmpty(this.formattedErrors)) {
                    this.samples = data;
                  }
                  else {
                    delete this.samples;
                  }
                });
              }
            },
            this.parseOptions
          );

          Papa.parse(this.file, config);
        }, 100);

        $scope.$watch('wizard.parseOptions', (newValue, oldValue) => {
          // Delimiter is auto-detected in the first run of the parse function, so we don't want to
          // re-parse just because it's being initialized.
          if (!_.isUndefined(oldValue)) {
            this.parse();
          }
        }, true);

        $scope.$watch('wizard.file', () => {
          this.parse();
        });
      }
    };
  });
