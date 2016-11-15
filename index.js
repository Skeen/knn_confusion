function data_to_sites(data)
{
    // TODO: Clean-up and prettify
    var sites_object = {};
    data.forEach(function(element)
    {
        sites_object[element.ground_truth] = 0;
    });

    var sites = [];
    for( var i in sites_object ) {
        sites.push(i);
    }
    return sites;
}

function data_to_confusion(data)
{
    var confusion_matrix = {};
    // Start counting
    data.forEach(function(element)
    {
        // TODO: Clean-up
        confusion_matrix[element.ground_truth] = (confusion_matrix[element.ground_truth] || {});
        confusion_matrix[element.ground_truth][element.nearest_neighbor] = (confusion_matrix[element.ground_truth][element.nearest_neighbor] || 0) + 1;
    });

    return confusion_matrix;
}

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
            var value = (confusion_matrix[ground][neighbor] || 0);
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
}

//var options = JSON.parse(process.argv[3]);

var options = require('commander');

options
  .version('0.0.1')
  .usage('[options] <file>')
  .option('-p, --packages', 'Print information about required packages')
  .option('-c, --color', 'Add color to output table')
  .option('-a, --array', 'Format output as array instead of tabular')
  .option('-x, --alias', 'Shorten header row for large tables')
  .option('-v, --verbose', 'Print A LOT of output')
  .option('-s, --standalone', 'Print a self-contained LaTeX document')
  .parse(process.argv);

var input_file = options.args[0];
if(input_file == undefined)
{
    console.error();
    console.error("Fatal error: No input file provided");
    options.help();
}

/* // TODO: Handle spurious arguments somehow
var spurious = options.args[1];
if(spurious != undefined)
{
    console.error();
    console.error("Spurious argument(s) found:", options.args.shift());
    console.error("NOTE: Options go in front of file-argument");
    options.help();
}
*/

var fs = require('fs')
fs.readFile(input_file, 'utf8', function (err,data) 
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

    if(options.verbose)
        console.log(json);

    var sites = data_to_sites(json.data);
    if(options.verbose)
        console.log(sites);

    var confusion = data_to_confusion(json.data);
    if(options.verbose)
        console.log(confusion);

    if(options.packages && options.color)
        console.log("Color requires:", "\\usepackage[table]{xcolor}");
    if(options.packages && options.array)
        console.log("Array requires:", "\\usepackage{amsmath}");

    if(options.verbose)
    {
        console.log("-----------");
        console.log("LATEX START");
        console.log("-----------");
    }
    if(options.standalone)
    {
        console.log("\\documentclass[crop]{standalone}");

        if(options.color)
            console.log("\\usepackage[table]{xcolor}");

        if(options.array)
            console.log("\\usepackage{amsmath}");

        console.log("\\begin{document}");
    }
    confusion_to_latex(sites, confusion, options);
    if(options.standalone)
    {
        console.log("\\end{document}");
    }
    if(options.verbose)
    {
        console.log("-----------");
        console.log(" LATEX END ");
        console.log("-----------");
    }
});
