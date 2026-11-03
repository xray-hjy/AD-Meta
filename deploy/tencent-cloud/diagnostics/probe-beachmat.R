args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 1L) quit(save = "no", status = 64L)
project <- normalizePath(args[[1]], mustWork = TRUE)
lock <- file.path(project, "renv.lock")
original_hash <- unname(tools::md5sum(lock))
status <- tryCatch({
  stopifnot(as.character(getRversion()) == "4.5.2")
  if (!requireNamespace("renv", quietly = TRUE)) stop("renv is not available in the base R library")
  options(Ncpus = 1L)
  cat("PROBE_START=", format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"), "\n", sep = "")
  cat("PROBE_TARGET=beachmat; dependencies may be restored from existing cache\n")
  # Separate project and library: the installed application's library is not a target.
  # Force only beachmat to rebuild so a cache hit cannot be mistaken for compilation.
  renv::restore(
    project = project,
    lockfile = lock,
    library = file.path(project, "library"),
    packages = "beachmat",
    rebuild = "beachmat",
    repos = c(CRAN = "https://mirrors.aliyun.com/CRAN"),
    clean = FALSE,
    prompt = FALSE
  )
  .libPaths(c(file.path(project, "library"), .libPaths()))
  stopifnot(as.character(utils::packageVersion("beachmat")) == "2.24.0")
  loadNamespace("beachmat")
  stopifnot(identical(original_hash, unname(tools::md5sum(lock))))
  cat("PROBE_PACKAGE_LOAD_OK\n")
  0L
}, error = function(e) {
  message("PROBE_ERROR=", conditionMessage(e))
  1L
})
cat("PROBE_EXIT=", status, "\n", sep = "")
quit(save = "no", status = status, runLast = FALSE)
