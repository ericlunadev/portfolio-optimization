import { Matrix } from "ml-matrix";

/**
 * Create outer product of two vectors: v1 * v2^T
 */
export function outerProduct(v1: number[], v2: number[]): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < v1.length; i++) {
    result[i] = [];
    for (let j = 0; j < v2.length; j++) {
      result[i][j] = v1[i] * v2[j];
    }
  }
  return result;
}

/**
 * Element-wise multiplication of two matrices
 */
export function hadamardProduct(a: number[][], b: number[][]): number[][] {
  const rows = a.length;
  const cols = a[0].length;
  const result: number[][] = [];

  for (let i = 0; i < rows; i++) {
    result[i] = [];
    for (let j = 0; j < cols; j++) {
      result[i][j] = a[i][j] * b[i][j];
    }
  }

  return result;
}

/**
 * Build covariance matrix from volatilities and correlation matrix
 * COV = diag(vol) * CORR * diag(vol) = outer(vol, vol) * CORR (element-wise)
 */
export function buildCovarianceMatrix(volatilities: number[], correlationMatrix: number[][]): number[][] {
  const volMatrix = outerProduct(volatilities, volatilities);
  return hadamardProduct(volMatrix, correlationMatrix);
}

/**
 * Calculate portfolio variance: w^T * COV * w
 */
export function portfolioVariance(weights: number[], covMatrix: number[][]): number {
  const w = Matrix.columnVector(weights);
  const cov = new Matrix(covMatrix);
  const result = w.transpose().mmul(cov).mmul(w);
  return result.get(0, 0);
}

/**
 * Calculate portfolio return: w^T * r
 */
export function portfolioReturn(weights: number[], returns: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i] * returns[i];
  }
  return sum;
}

/**
 * Dot product of two vectors
 */
export function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Sum of array elements
 */
export function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}
