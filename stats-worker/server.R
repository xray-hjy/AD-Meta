suppressPackageStartupMessages({
  library(plumber)
  library(jsonlite)
})

fail <- function(message, status = 400) {
  structure(
    list(message = message, status = status),
    class = c("worker_error", "error", "condition")
  )
}

validate_request <- function(payload) {
  required <- c("jobId", "method", "abundanceScale", "formula", "samples", "features", "matrix")
  missing <- setdiff(required, names(payload))
  if (length(missing) > 0) stop(fail(paste("Missing fields:", paste(missing, collapse = ", "))))
  if (!grepl("^[a-f0-9]{32}$", payload$jobId)) stop(fail("Invalid jobId"))
  expected <- if (payload$abundanceScale == "counts") "ancombc2" else if (
    payload$abundanceScale %in% c("relative_abundance", "normalized_abundance")
  ) "maaslin2" else NA_character_
  if (is.na(expected) || payload$method != expected) stop(fail("Method does not match abundanceScale"))
  if (!grepl("^Group( +\\+ +[A-Za-z][A-Za-z0-9_]*)*$", payload$formula)) stop(fail("Invalid model formula"))

  metadata <- as.data.frame(payload$samples, stringsAsFactors = FALSE)
  values <- as.matrix(payload$matrix)
  storage.mode(values) <- "double"
  if (nrow(values) != nrow(metadata) || ncol(values) != length(payload$features)) {
    stop(fail("Matrix dimensions do not match samples/features"))
  }
  if (any(!is.finite(values)) || any(values < 0)) stop(fail("Matrix must be finite and non-negative"))
  if (!all(metadata$Group %in% c("AD", "NC"))) stop(fail("Group must contain only AD and NC"))
  if (any(table(metadata$Group) < 5)) stop(fail("Formal inference requires at least five samples per group"))
  if (payload$abundanceScale == "counts" && any(abs(values - round(values)) > 1e-12)) {
    stop(fail("Count matrix must contain integers"))
  }
  metadata$Group <- relevel(factor(metadata$Group), ref = "NC")
  rownames(metadata) <- metadata$Sample
  colnames(values) <- payload$features
  rownames(values) <- metadata$Sample
  list(metadata = metadata, values = values)
}

normalized_items <- function(feature, p, q, effect, metric) {
  p <- as.numeric(p)
  q <- as.numeric(q)
  effect <- as.numeric(effect)
  p[!is.finite(p)] <- 1
  q[!is.finite(q)] <- 1
  effect[!is.finite(effect)] <- 0
  lapply(seq_along(feature), function(index) {
    list(
      featureId = as.character(feature[[index]]),
      pValue = p[[index]],
      qValue = q[[index]],
      effectSize = effect[[index]],
      effectMetric = metric
    )
  })
}

run_ancombc2 <- function(validated, payload) {
  suppressPackageStartupMessages({
    library(ANCOMBC)
    library(TreeSummarizedExperiment)
    library(SummarizedExperiment)
  })
  counts <- t(round(validated$values))
  experiment <- TreeSummarizedExperiment(
    assays = list(counts = counts),
    colData = S4Vectors::DataFrame(validated$metadata)
  )
  fit <- ancombc2(
    data = experiment,
    assay_name = "counts",
    tax_level = NULL,
    fix_formula = payload$formula,
    rand_formula = NULL,
    p_adj_method = "BH",
    prv_cut = as.numeric(payload$prevalence %||% 0.1),
    lib_cut = 0,
    group = "Group",
    struc_zero = TRUE,
    neg_lb = TRUE,
    alpha = as.numeric(payload$alpha %||% 0.05),
    global = FALSE
  )
  result <- as.data.frame(fit$res)
  coefficient <- grep("^lfc_GroupAD$", names(result), value = TRUE)[1]
  p_column <- grep("^p_GroupAD$", names(result), value = TRUE)[1]
  q_column <- grep("^q_GroupAD$", names(result), value = TRUE)[1]
  if (any(is.na(c(coefficient, p_column, q_column)))) stop("ANCOM-BC2 result is missing GroupAD columns")
  feature <- if ("taxon" %in% names(result)) result$taxon else rownames(result)
  normalized_items(feature, result[[p_column]], result[[q_column]], result[[coefficient]], "ancombc2_log_fold_change")
}

run_maaslin2 <- function(validated, payload) {
  suppressPackageStartupMessages(library(Maaslin2))
  output_dir <- tempfile(pattern = paste0("maaslin2-", payload$jobId, "-"))
  dir.create(output_dir, recursive = TRUE)
  on.exit(unlink(output_dir, recursive = TRUE, force = TRUE), add = TRUE)
  covariates <- setdiff(strsplit(gsub(" ", "", payload$formula), "\\+")[[1]], "Group")
  fit <- Maaslin2(
    input_data = as.data.frame(validated$values),
    input_metadata = validated$metadata,
    output = output_dir,
    fixed_effects = c("Group", covariates),
    reference = "Group,NC",
    normalization = "NONE",
    transform = "LOG",
    analysis_method = "LM",
    standardize = FALSE,
    plot_heatmap = FALSE,
    plot_scatter = FALSE
  )
  result <- as.data.frame(fit$results)
  group_result <- result[result$metadata == "Group" & result$value == "AD", , drop = FALSE]
  normalized_items(group_result$feature, group_result$pval, group_result$qval, group_result$coef, "maaslin2_model_coefficient")
}

`%||%` <- function(left, right) if (is.null(left)) right else left

build_router <- function() {
  router <- pr()
  router$handle("GET", "/health", function() list(status = "ok"))
  router$handle("POST", "/v1/differential-abundance", function(req, res) {
    tryCatch({
      payload <- fromJSON(req$postBody, simplifyVector = TRUE)
      validated <- validate_request(payload)
      items <- if (payload$method == "ancombc2") run_ancombc2(validated, payload) else run_maaslin2(validated, payload)
      q_values <- vapply(items, function(item) item$qValue, numeric(1))
      list(
        method = if (payload$method == "ancombc2") "ANCOM-BC2" else "MaAsLin2",
        modelFormula = payload$formula,
        alpha = as.numeric(payload$alpha %||% 0.05),
        items = items,
        summary = list(
          testedCount = length(items),
          significantCount = sum(q_values < as.numeric(payload$alpha %||% 0.05))
        )
      )
    }, worker_error = function(error) {
      res$status <- error$status %||% 400
      list(error = error$message %||% "Invalid request")
    }, error = function(error) {
      res$status <- 422
      list(error = conditionMessage(error), errorType = class(error)[1])
    })
  })
  router
}

if (sys.nframe() == 0) {
  build_router()$run(host = "0.0.0.0", port = 8001)
}
