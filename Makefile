
INPUT := $(wildcard input/*)
OUTPUT := $(addprefix output/,$(notdir $(addsuffix .json, $(INPUT))))

output/%.json: input/%
	@mkdir -p output
	cat $< | ./index.js > $@

all: $(OUTPUT)
