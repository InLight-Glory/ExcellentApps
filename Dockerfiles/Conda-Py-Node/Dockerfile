# Start from an official Ubuntu base image
FROM ubuntu:22.04

# Avoid prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Update and install essential packages
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    gnupg \
    build-essential \
    ca-certificates \
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# Install Miniconda (lightweight version of Anaconda)
ENV CONDA_DIR=/opt/conda
ENV PATH=$CONDA_DIR/bin:$PATH

RUN wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O miniconda.sh && \
    bash miniconda.sh -b -p $CONDA_DIR && \
    rm miniconda.sh && \
    conda clean -afy

# Install Python via conda (optional if you want a specific version)
RUN conda install -y python=3.11 && conda clean -afy

# Install Node.js (LTS version)
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && \
    apt-get install -y nodejs

# Verify installs (optional)
RUN python --version && node --version && npm --version && conda --version

# Set working directory
WORKDIR /workspace

# Default command
CMD [ "bash" ]
