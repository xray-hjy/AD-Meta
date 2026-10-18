# Read public serialized tables as data; do not source the author's analysis code.
args <- commandArgs(trailingOnly=TRUE)
stopifnot(length(args) == 2, !dir.exists(args[2]))
env <- new.env()
load(args[1], envir=env)
stopifnot(is.data.frame(env$meta), is.data.frame(env$metaphlan3.raw))
meta <- env$meta[, c('Participant', 'Age', 'Sex', 'CDR', 'amyloid.positive.AF')]
stopifnot(!anyDuplicated(meta$Participant), all(meta$CDR == 0), all(meta$amyloid.positive.AF %in% c(0,1)))
tax <- env$metaphlan3.raw
keep <- grepl('(^|[|])(g__|s__)', tax$clade_name) & !grepl('[|]t__', tax$clade_name)
tax <- tax[keep, ]
dir.create(args[2], recursive=TRUE)
write.table(meta, file.path(args[2], 'participants.tsv'), sep='\t', row.names=FALSE, quote=FALSE, na='')
write.table(tax, file.path(args[2], 'taxonomic_profiles.tsv'), sep='\t', row.names=FALSE, quote=FALSE, na='')
cat('Extracted', nrow(meta), 'metadata records and', nrow(tax), 'genus/species clades; no inferential analysis executed.\n')
