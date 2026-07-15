FROM bioconductor/bioconductor_docker:RELEASE_3_21

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/* \
  && R -q -e "options(repos=c(CRAN='https://cloud.r-project.org')); install.packages(c('plumber','jsonlite')); BiocManager::install(c('ANCOMBC','Maaslin2','TreeSummarizedExperiment'), ask=FALSE, update=FALSE)"

RUN useradd --create-home --uid 10001 worker
WORKDIR /srv/worker
COPY server.R ./server.R
COPY tests ./tests
RUN Rscript tests/model_smoke.R
RUN chown -R worker:worker /srv/worker
USER worker

EXPOSE 8001
CMD ["Rscript", "server.R"]
