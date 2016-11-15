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

function confusion_to_latex(data)
{
    var sites = data.sites;
    var confusion_matrix = data.confusion;

    var write = function(str)
    {
        process.stdout.write(str);
    }

    console.log("\\[");
    console.log("\\begin{array}{|l|" + Array(sites.length+1).join('c|') + "} \\hline");
    // Header line
    write("\\text{X}");
    sites.forEach(function(site)
    {
        write(" & \\text{" + site + "}");
    });
    console.log(" \\\\ \\hline");

    sites.forEach(function(ground)
    {
        write("\\text{" + ground + "}");
        sites.forEach(function(neighbor)
        {
            var value = (confusion_matrix[ground][neighbor] || 0);
            write(" & " + value);
        });
        console.log(" \\\\ \\hline");
    });
    console.log("\\end{array}");
    console.log("\\]");
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
    confusion_to_latex(confusion);
    console.log("LATEX END");
});
