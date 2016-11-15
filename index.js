fs = require('fs')

function data_to_confusion(data)
{
    var data_to_sites = function(data)
    {
        var sites_object = {};
        data.forEach(function(element)
        {
            sites_object[element.ground_truth] = 0;
        });

        var sites =[];
        for( var i in sites_object ) {
            sites.push(i);
        }
        return sites;
    }

    var sites = data_to_sites(data);
    console.log("Sites:", sites);

    var confusion_matrix = {};
    // Start counting
    data.forEach(function(element)
    {
        confusion_matrix[element.ground_truth] = (confusion_matrix[element.ground_truth] || {});
        confusion_matrix[element.ground_truth][element.nearest_neighbor] = (confusion_matrix[element.ground_truth][element.nearest_neighbor] || 0) + 1;
    });
    console.log(confusion_matrix);

    return {sites: sites, confusion: confusion_matrix};
}

function confusion_to_latex(data, opt)
{
    var sites = data.sites;
    var confusion_matrix = data.confusion;

    var write = function(str)
    {
        process.stdout.write(str);
    }

    var start = function()
    {
        if(opt.array)
        {
            console.log("\\[");
            write("\\begin{array}{");
        }
        else
        {
            write("\\begin{tabular}{");
        }
        console.log("|l|" + Array(sites.length+1).join('c|') + "} \\hline");
    }

    var end = function()
    {
        if(opt.array)
        {
            console.log("\\end{array}");
            console.log("\\]");
        }
        else
        {
            console.log("\\end{tabular}");
        }
    }

    var header_line = function()
    {
        write("\\text{X}");
        sites.forEach(function(site)
                {
                    write(" & \\text{" + site + "}");
                });
        console.log(" \\\\ \\hline");
    }

    start();
    header_line();
    // Confusion matrix itself
    sites.forEach(function(ground)
    {
        write("\\text{" + ground + "}");
        sites.forEach(function(neighbor)
        {
            var value = (confusion_matrix[ground][neighbor] || 0);
            if(opt.color)
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


fs.readFile(process.argv[2], 'utf8', function (err,data) 
{
    if (err) {
        return console.log(err);
    }

    var json = JSON.parse(data);
    console.log(json);

    var confusion = data_to_confusion(json.data);
    //console.log(confusion);

    console.log("LATEX START");
    confusion_to_latex(confusion, {color:true, array:true});
    console.log("LATEX END");
});
