source("server.R")

samples <- data.frame(
  Sample = c(paste0("AD", 1:5), paste0("NC", 1:5)),
  Group = c(rep("AD", 5), rep("NC", 5)),
  stringsAsFactors = FALSE
)
features <- c("K00001", "K00002", "K00003")

assert_result <- function(items, method) {
  if (length(items) == 0) stop(paste(method, "returned no features"))
  q_values <- vapply(items, function(item) as.numeric(item$qValue), numeric(1))
  effects <- vapply(items, function(item) as.numeric(item$effectSize), numeric(1))
  if (any(!is.finite(q_values)) || any(q_values < 0 | q_values > 1)) {
    stop(paste(method, "returned invalid q-values"))
  }
  if (any(!is.finite(effects))) stop(paste(method, "returned invalid effects"))
}

counts_payload <- list(
  jobId = paste(rep("a", 32), collapse = ""),
  method = "ancombc2",
  abundanceScale = "counts",
  formula = "Group",
  alpha = 0.05,
  prevalence = 0.1,
  samples = samples,
  features = features,
  matrix = rbind(
    c(100, 10, 40), c(110, 11, 42), c(120, 12, 39), c(105, 10, 41), c(115, 11, 40),
    c(10, 100, 40), c(11, 110, 41), c(12, 120, 39), c(10, 105, 42), c(11, 115, 40)
  )
)
assert_result(run_ancombc2(validate_request(counts_payload), counts_payload), "ANCOM-BC2")

relative_payload <- counts_payload
relative_payload$jobId <- paste(rep("b", 32), collapse = "")
relative_payload$method <- "maaslin2"
relative_payload$abundanceScale <- "relative_abundance"
relative_payload$matrix <- t(apply(counts_payload$matrix, 1, function(row) row / sum(row)))
assert_result(run_maaslin2(validate_request(relative_payload), relative_payload), "MaAsLin2")

cat("R model smoke tests passed\n")
