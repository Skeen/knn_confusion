function data_to_sites(data)
{
    // TODO: Clean-up and prettify
    var sites_object = {};
    data.forEach(function(element)
    {
        sites_object[element.ground_truth.tag] = 0;
    });

    var sites = [];
    for( var i in sites_object ) {
        sites.push(i);
    }
    return sites;
}

function calculate_weights(element)
{
    // Weight function, '1 / distance' ensures that the closest neighbours count the most
    var weightf = function(distance)
    {
        // Trunc to 1 to avoid NaNs
        return Math.min(1, 1 / distance);
    }

    var weights = {};
    element.neighbours.forEach(function(neighbour)
    {
        weights[neighbour.tag] = (weights[neighbour.tag] || {});
        weights[neighbour.tag].weight = (weights[neighbour.tag].weight || 0) + weightf(neighbour.distance);
        weights[neighbour.tag].count = (weights[neighbour.tag].count || 0) + 1;
    });
    return weights;
}

function calculate_percentages(weights)
{
    var sum = Object.keys(weights).reduce(function(acc, key)
    {
        var elem = weights[key];
        var avg_weight = (elem.weight / elem.count);
        return acc + avg_weight;
    }, 0);
    //console.log("sum", sum);

    var percentages = Object.keys(weights).reduce(function(acc, key)
    {
        var elem = weights[key];
        var avg_weight = (elem.weight / elem.count);
        acc[key] = avg_weight / sum;
        return acc;
    }, {});
    //console.log("percent", percentages);

    return percentages;
}

function data_to_confusion(data, opt)
{
    var confusion_matrix = {};

    var fill = function(ground, neighbour, increment)
    {
        //console.log("Increasing", ground, "x", neighbour, "with", increment);
        confusion_matrix[ground] = (confusion_matrix[ground] || {});
        confusion_matrix[ground][neighbour] = (confusion_matrix[ground][neighbour] || 0) + increment;
    }

    // Start counting
    data.forEach(function(element)
    {
        if(opt.fractional)
        {
            var weights = calculate_weights(element);

            // TODO: Fix this shit
			
            var percentages = calculate_percentages(weights);
            Object.keys(percentages).forEach(function(key)
            {
                var elem = percentages[key];
				//console.log("key: ", key, " value: ", elem);
                fill(element.ground_truth.tag, key, elem);
            });
            /*
            element.neighbours.forEach(function(neighbour)
            {
                fill(element.ground_truth.tag, neighbour.tag, weights[neighbour.tag]);
            });
			*/
        }
        else
        {
            // Find the nearest neighbour
            var nearest_neighbour = element.neighbours.reduce(function(a,b)
            {
                return (a.distance < b.distance) ? a : b;
            });

            fill(element.ground_truth.tag, nearest_neighbour.tag, 1);
        }
    });

    return confusion_matrix;
}

function boxes(str)
{
    console.log("+" + Array(str.length+1).join('-') + "+");
    console.log("|" + str + "|");
    console.log("+" + Array(str.length+1).join('-') + "+");
};

function confusion_to_latex(sites, confusion_matrix, opt)
{
    var write = function(str)
    {
        process.stdout.write(str);
    }

    var tw = function(str)
    {
        if(opt.array)
        {
            return "\\text{" + str + "}";
        }
        else
        {
            return str;
        }
    }

    var start = function()
    {
        if(opt.array)
        {
            console.log("\\(");
            write("\\begin{array}{");
        }
        else
        {
            write("\\begin{tabular}{");
        }
        console.log("|lcl|" + Array(sites.length+1).join('c|') + "} \\hline");
    }

    var end = function()
    {
        if(opt.array)
        {
            console.log("\\end{array}");
            console.log("\\)");
        }
        else
        {
            console.log("\\end{tabular}");
        }
    }

    var header_line = function()
    {
        write("\\multicolumn{3}{|c|}{" + tw("X") + "}");
        sites.forEach(function(site, index)
        {
            if(opt.alias)
            {
                write(" & " + tw(site));
            }
            else
            {
                write(" & " + tw("(" + index + ")"));
            }
        });
        console.log(" \\\\ \\hline");
    }

    if(options.packages && options.color)
        console.log("Color requires:", "\\usepackage[table]{xcolor}");
    if(options.packages && options.array)
        console.log("Array requires:", "\\usepackage{amsmath}");

    if(opt.verbose || opt.barrier)
        boxes(" LATEX START ");

    if(opt.standalone)
    {
        console.log("\\documentclass[crop]{standalone}");

        if(options.color)
            console.log("\\usepackage[table]{xcolor}");

        if(options.array)
            console.log("\\usepackage{amsmath}");

        console.log("\\begin{document}");
    }

    start();
    header_line();
    // Confusion matrix itself
    sites.forEach(function(ground, index)
    {
        if(opt.alias)
        {
            write("\\multicolumn{3}{|c|}{" + tw(ground) + "}");
        }
        else
        {
            write(tw(index) + " & : & " + tw(ground));
        }
        sites.forEach(function(neighbor)
        {
            var value = Math.floor(((confusion_matrix[ground] || {})[neighbor] || 0) * 100) / 100;
            if(opt.color && value != 0)
            {
                var color = (ground == neighbor ? "green" : "red");
                var sum = sites.reduce(function(a, b) { return a + (confusion_matrix[ground][b] || 0); }, 0);
                var percent = value / sum * 100;

                write(" & \\cellcolor{" + color + "!" + percent + "}" + value);
            }
            else
            {
                write(" & " + value);
            }
        });
        console.log(" \\\\ \\hline");
    });
    end();

    if(opt.standalone)
    {
        console.log("\\end{document}");
    }
    if(opt.verbose || opt.barrier)
        boxes("  LATEX END  ");
}

function confusion_to_accuracy(sites, confusion_matrix, opt)
{
    var trials = 0;
    var accurate = 0;

    Object.keys(confusion_matrix).forEach(function(ground_truth)
    {
        var row = confusion_matrix[ground_truth];
        Object.keys(row).forEach(function(neighbour)
        {
            var count = row[neighbour];
            trials += count;

            if(ground_truth == neighbour)
            {
                accurate += count;
            }
        });
    });

    var accuracy = ((accurate / trials) * 100);

    var result = {};
    result.accuracy = accuracy;

    // Add trials and num accurate, unless we're super tiny
    if(opt.resume < 3)
    {
        result.trials = trials;
        result.accurate = accurate;
    }

    // Add precision and recall, unless we're really tiny
    if(opt.resume < 2)
    {
        // NOTE: See http://stats.stackexchange.com/a/51301
        // NOTE: Need more; See https://en.wikipedia.org/wiki/Precision_and_recall#
        var precall = sites.reduce(function(acc, ground_truth)
        {
            // Common nominator
            var nom = ((confusion_matrix[ground_truth] || {})[ground_truth] || 0);
            // Recall
            var denom_recall = sites.reduce(function(acc, neighbour)
            {
                var count = ((confusion_matrix[ground_truth] || {})[neighbour] || 0);
                return acc + count;
            },0);
            // Precision
            var denom_precision = sites.reduce(function(acc, neighbour)
            {
                var count = ((confusion_matrix[neighbour] || {})[ground_truth] || 0);
                return acc + count;
            },0);
            // Set the output
            acc[ground_truth] = {};
            acc[ground_truth].precision = (nom/denom_precision)*100;
            acc[ground_truth].recall = (nom/denom_recall)*100;
            // Return the accumulative object
            return acc;
        }, {});

        result.precall = precall;
    }

    // Print out our result
    if(opt.verbose || opt.barrier)
        boxes(" JSON  START ");
    console.log(result);
    if(opt.verbose || opt.barrier)
        boxes("  JSON  END  ");

}

var options = require('commander');

function increaser(v, total) { return total + 1; };

options
  .version('0.0.1')
  .usage('[options] <file>')
  .option('-v, --verbose', 'Print more information', increaser, 0)
  .option('-,--', '')
  .option('-,--', 'Confusion-Matrix:')
  .option('-f, --fractional', 'Generate a fractional confusion matrix')
  //.option('-k, --knn <number>', 'Consider only the 'n' nearest neighbours')
  //.option('-w, --weight <name>', 'Utilize the specified weight function')
  .option('-,--', '')
  .option('-,--', 'Summary:')
  .option('-r, --resume', 'Print resume of the confusion matrix', increaser, 0)
  .option('-,--', '')
  .option('-,--', 'Latex:')
  .option('-l, --latex', 'Print confusion matrix as LaTeX')
  .option('-s, --standalone', 'Print a self-contained LaTeX document')
  .option('-c, --color', 'Add color to output table')
  .option('-p, --packages', 'Print information about required packages')
  .option('-x, --alias', 'Shorten header row for large tables')
  .option('-a, --array', 'Format output as array instead of tabular')
  .option('-h, --help', '');

// Capture the internal helper
var internal_help = options.help;

// Parse argv
options.parse(process.argv);

// Utilize our modified helper
var help = function()
{
    internal_help.bind(options)(function(value)
    {
        var help = value.split('\n');
        // Find our marker and use it to create categories
        var new_help = help.map(function(line)
        {
            var marker = line.indexOf("-,--");
            if(marker != -1)
            {
                return "   " + line.substr(marker+4).trim();
            }
            return line;
        }).filter(function(line)
        {
            return line.indexOf("-h, --help") == -1;
        });
        //console.log(new_help);

        return new_help.join('\n');
    });
}

// Was -h, or --help passed?
if(options.help == undefined)
    help();

var input_file = options.args[0];
if(input_file == undefined)
{
    console.error();
    console.error("Fatal error: No input file provided");
    help();
}

// TODO: Handle spurious arguments somehow

var fs = require('fs')
fs.readFile(input_file, 'utf8', function(err,data) 
{
    if (err) {
        console.error();
        console.error("Fatal error: Unable to open input file");
        console.error();
        console.error(err);
        process.exit(-1);
    }
    // Parse the input file as JSON
    var json;
    try
    {
        json = JSON.parse(data);
    }
    catch(err)
    {
        console.error();
        console.error("Fatal error: Input file is not valid JSON!");
        console.error();
        console.error(err);
        process.exit(-1);
    }

    if(options.verbose >= 3)
    {
        console.log("Input json:");
        console.log(json);
        console.log();
    }

    var sites = data_to_sites(json);
    if(options.verbose >= 2)
    {
        console.log("Sites found:");
        console.log(sites);
        console.log();
    }

    var confusion = data_to_confusion(json, options);
    // Only if dump confusion matrix, if we aren't already doing so
    if(options.verbose && (options.resume || options.latex))
    {
        console.log("Confusion Matrix:");
        console.log(confusion);
        console.log();
    }
    // Dump confusion matrix
    if(!(options.resume || options.latex))
        console.log(confusion);

    // Enable barriers
    if(options.resume && options.latex)
        options.barrier = true;

    if(options.latex)
        confusion_to_latex(sites, confusion, options);
    if(options.resume)
        confusion_to_accuracy(sites, confusion, options);
});
